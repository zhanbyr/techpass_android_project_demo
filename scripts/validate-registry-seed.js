#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const fixturePath = path.join(__dirname, "..", "docs", "registry", "data", "registry-seed.json");
const seed = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
const idsUnique = (items, field = "id") => new Set(items.map((item) => item[field])).size === items.length;
const byId = (items) => new Map(items.map((item) => [item.id, item]));

assert.equal(seed.schemaVersion, 1, "unknown schema version");
assert.equal(seed.demoOnly, true, "fixture must be marked demo-only");
assert.equal(seed.companies.length, 4, "expected four demo companies");
assert.equal(seed.employees.length, 16, "expected sixteen demo employees");
assert.equal(seed.directions.length, 6, "expected six catalog directions");
assert.ok(idsUnique(seed.companies), "company IDs must be unique");
assert.ok(idsUnique(seed.employees), "employee IDs must be unique");
assert.ok(idsUnique(seed.employees, "demoNumber"), "demo numbers must be unique");
assert.ok(idsUnique(seed.assignments), "assignment IDs must be unique");
assert.ok(idsUnique(seed.auditEvents), "audit event IDs must be unique");
assert.ok(seed.employees.every(({ id }) => /^EMP-\d{6}$/.test(id)), "employee ID format must be EMP-000001");
assert.ok(seed.employees.every(({ demoNumber }) => /^\d{12}$/.test(demoNumber)), "demo numbers must contain twelve digits");

const companies = byId(seed.companies);
const employees = byId(seed.employees);
const directions = byId(seed.directions);
const approvedDirectionIds = ["DIR-FACE", "DIR-ACS"];
for (const company of seed.companies) {
  assert.deepEqual(company.allowedDirectionIds, approvedDirectionIds, `${company.id} may only allow Face ID and ACS`);
  assert.equal(company.maxDirections, 2, `${company.id} must be capped at two directions`);
  for (const directionId of company.allowedDirectionIds) assert.ok(directions.has(directionId), `unknown direction ${directionId}`);
}

const assignmentsByEmployee = new Map(seed.employees.map((employee) => [employee.id, []]));
for (const assignment of seed.assignments) {
  const employee = employees.get(assignment.employeeId);
  const company = companies.get(assignment.companyId);
  assert.ok(employee, `assignment ${assignment.id} references an unknown employee`);
  assert.ok(company, `assignment ${assignment.id} references an unknown company`);
  assert.ok(directions.has(assignment.directionId), `assignment ${assignment.id} references an unknown direction`);
  assert.equal(assignment.status, "active", `seed assignment ${assignment.id} must start active`);
  assert.equal(assignment.endedAt, null, `active assignment ${assignment.id} cannot have an end date`);
  assert.equal(employee.companyId, assignment.companyId, `assignment ${assignment.id} must match current company`);
  assert.ok(company.allowedDirectionIds.includes(assignment.directionId), `${company.id} cannot assign ${assignment.directionId}`);
  assignmentsByEmployee.get(employee.id).push(assignment);
}

for (const employee of seed.employees) {
  const company = companies.get(employee.companyId);
  assert.ok(company, `employee ${employee.id} references an unknown company`);
  const active = assignmentsByEmployee.get(employee.id);
  assert.ok(active.length >= 1, `employee ${employee.id} needs at least one direction`);
  assert.ok(active.length <= Math.min(3, company.maxDirections), `employee ${employee.id} exceeds the direction limit`);
  assert.equal(new Set(active.map(({ directionId }) => directionId)).size, active.length, `employee ${employee.id} has duplicate directions`);
  assert.equal(employee.status, "active", `seed employee ${employee.id} must start active`);
}

for (const company of seed.companies) {
  const people = seed.employees.filter((employee) => employee.companyId === company.id);
  assert.equal(people.length, 4, `${company.id} should have four demo employees`);
  assert.ok(people.some((person) => assignmentsByEmployee.get(person.id).length === 1), `${company.id} needs single-direction examples`);
  assert.ok(people.some((person) => assignmentsByEmployee.get(person.id).length === 2), `${company.id} needs dual-direction examples`);
}

for (const event of seed.auditEvents) {
  assert.ok(event.id && event.type && event.entityType && event.entityId && event.occurredAt, "audit events need core fields");
  assert.ok(event.actor?.id && event.actor?.role, `audit event ${event.id} needs an actor`);
}

process.stdout.write(`Registry seed valid: ${seed.companies.length} companies, ${seed.employees.length} employees, ${seed.assignments.length} assignments, ${seed.auditEvents.length} events.\n`);
