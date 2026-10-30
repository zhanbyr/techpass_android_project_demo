#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const core = require("../docs/registry/registry-core.js");

const seed = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "docs", "registry", "data", "registry-seed.json"), "utf8"));
const admin = { id: "admin-demo", role: "IT_ADMIN" };
const anotherAdmin = { id: "second-admin-demo", role: "IT_ADMIN" };
const manager = { id: "security-demo", role: "SECURITY_MANAGER" };
const technician = { id: "tech-demo", role: "TECHNICIAN" };
const fixedTime = "2026-10-30T12:00:00.000Z";

const store = { companies: [], directions: [], employees: [], assignments: [], auditEvents: [], approvalRequests: [] };
const firstInstall = core.installSeed(store, seed);
assert.equal(firstInstall.alreadyInstalled, false);
assert.equal(core.installSeed(store, seed).alreadyInstalled, true, "seed install must be idempotent");
assert.equal(store.employees.length, 16);
assert.deepEqual(core.assertStoreInvariants(store), []);

for (const companyId of Object.keys(core.DEMO_COMPANY_POLICIES)) {
  const company = store.companies.find((item) => item.id === companyId);
  assert.throws(() => core.updateCompany(store, companyId, { allowedDirectionIds: ["DIR-FACE", "DIR-CCTV"], maxDirections: 2 }, admin, fixedTime), /только Face ID и СКУД/);
  assert.deepEqual(company.allowedDirectionIds, ["DIR-FACE", "DIR-ACS"], "rejected policy must not mutate company");
}

assert.throws(() => core.createEmployee(store, { fullName: "Тестовый Сотрудник", companyId: "CTR-001", directionIds: ["DIR-CCTV"] }, admin, fixedTime), /не может назначать/);
assert.throws(() => core.createEmployee(store, { fullName: "Тестовый Сотрудник", companyId: "CTR-001", directionIds: ["DIR-FACE", "DIR-ACS", "DIR-APS"] }, admin, fixedTime), /не может назначать|максимум/);
assert.throws(() => core.createEmployee(store, { fullName: "Тестовый Сотрудник", companyId: "CTR-001", demoNumber: store.employees[0].demoNumber, directionIds: ["DIR-FACE"] }, admin, fixedTime), /уже назначен/);

const added = core.createEmployee(store, { fullName: "Тестовый Новый", companyId: "CTR-001", directionIds: ["DIR-ACS"] }, admin, fixedTime);
assert.equal(added.id, "EMP-000017");
assert.match(added.demoNumber, /^\d{12}$/);
assert.equal(new Set(store.employees.map((item) => item.demoNumber)).size, store.employees.length);
assert.equal(core.searchEmployees(store, added.id)[0].id, added.id);
assert.equal(core.searchEmployees(store, added.demoNumber)[0].id, added.id);
assert.equal(core.searchEmployees(store, "OTIS").some((item) => item.id === added.id), false);
assert.deepEqual(core.assertStoreInvariants(store), []);

const originalEmployeeId = store.employees[0].id;
const originalAssignments = core.activeAssignments(store, originalEmployeeId);
core.changeEmployeeCompany(store, originalEmployeeId, "CTR-002", ["DIR-ACS"], admin, fixedTime);
assert.equal(store.employees[0].id, originalEmployeeId, "employee ID must survive company changes");
assert.ok(originalAssignments.every((item) => item.status === "closed" && item.endedAt === fixedTime));
assert.equal(core.activeAssignments(store, originalEmployeeId).length, 1);
assert.equal(core.activeAssignments(store, originalEmployeeId)[0].companyId, "CTR-002");
assert.deepEqual(core.assertStoreInvariants(store), []);
assert.equal(core.searchEmployees(store, "К-Alarm").some((item) => item.id === originalEmployeeId), true, "historical company must remain searchable");

core.setEmployeeStatus(store, added.id, "inactive", [], admin, fixedTime);
assert.equal(store.employees.find((item) => item.id === added.id).status, "inactive");
assert.equal(core.activeAssignments(store, added.id).length, 0);
core.setEmployeeStatus(store, added.id, "active", ["DIR-FACE"], admin, fixedTime);
assert.equal(core.activeAssignments(store, added.id).length, 1, "reactivation creates a fresh assignment while preserving closed history");
assert.equal(store.assignments.filter((item) => item.employeeId === added.id).length, 2);
const extension = core.createDirection(store, "Инженерия демо", admin, fixedTime);
assert.match(extension.id, /^DIR-EXT-\d{6}$/);
assert.throws(() => core.createEmployee(store, { fullName: "Ограниченный тест", companyId: "CTR-001", directionIds: [extension.id] }, admin, fixedTime), /не может назначать/);
assert.deepEqual(core.assertStoreInvariants(store), []);

const approval = core.requestApproval(store, originalEmployeeId, "Запрос на специальный просмотр журнала", admin, fixedTime);
assert.throws(() => core.decideApproval(store, approval.id, "approved", "Самосогласование", { id: admin.id, role: "SECURITY_MANAGER" }, fixedTime), /не может согласовать/);
assert.equal(approval.status, "pending", "self-approval rejection must not mutate request");
assert.equal(core.decideApproval(store, approval.id, "approved", "Проверено", manager, fixedTime).status, "approved");
assert.throws(() => core.createEmployee(store, { fullName: "Запрещённый", companyId: "CTR-001", directionIds: ["DIR-FACE"] }, technician, fixedTime), /не может выполнять/);
assert.deepEqual(core.assertStoreInvariants(store), []);

process.stdout.write("Registry core tests passed: idempotent seed, unique IDs/numbers, company policies, assignments/history, search and separated approval roles.\n");
