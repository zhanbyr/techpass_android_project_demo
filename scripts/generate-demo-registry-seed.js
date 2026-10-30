#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const outputPath = path.join(__dirname, "..", "docs", "registry", "data", "registry-seed.json");
const seedTimestamp = "2026-10-30T09:00:00.000Z";

const directions = [
  { id: "DIR-FACE", name: "Face ID", active: true },
  { id: "DIR-ACS", name: "СКУД", active: true },
  { id: "DIR-APS", name: "АПС", active: true },
  { id: "DIR-ASP", name: "АСПТ", active: true },
  { id: "DIR-CCTV", name: "СВН / видеонаблюдение", active: true },
  { id: "DIR-ALARM", name: "Тревожная сигнализация", active: true },
];

const companies = [
  { id: "CTR-001", name: "К-Alarm" },
  { id: "CTR-002", name: "OTIS" },
  { id: "CTR-003", name: "ТЭ" },
  { id: "CTR-004", name: "ОКТА" },
].map((company) => ({
  ...company,
  status: "active",
  allowedDirectionIds: ["DIR-FACE", "DIR-ACS"],
  maxDirections: 2,
  createdAt: seedTimestamp,
  updatedAt: seedTimestamp,
}));

const people = [
  ["Алан Мырзабеков", "CTR-001", "347081970624", ["DIR-FACE"]],
  ["Айша Нурланова", "CTR-001", "546838420168", ["DIR-ACS"]],
  ["Марат Беков", "CTR-001", "248133777540", ["DIR-FACE", "DIR-ACS"]],
  ["Дана Садыкова", "CTR-001", "677038629568", ["DIR-FACE", "DIR-ACS"]],
  ["Данияр Толеуов", "CTR-002", "826507408308", ["DIR-ACS"]],
  ["София Ким", "CTR-002", "837054308740", ["DIR-FACE"]],
  ["Ернар Жумабек", "CTR-002", "101792670619", ["DIR-FACE", "DIR-ACS"]],
  ["Лейла Аскарова", "CTR-002", "893353520642", ["DIR-ACS", "DIR-FACE"]],
  ["Нурлан Байжан", "CTR-003", "159706463456", ["DIR-FACE"]],
  ["Мадина Каримова", "CTR-003", "784443787414", ["DIR-ACS"]],
  ["Тимур Сейтахмет", "CTR-003", "135587699533", ["DIR-FACE", "DIR-ACS"]],
  ["Айгерим Досжан", "CTR-003", "100357505042", ["DIR-FACE", "DIR-ACS"]],
  ["Арман Сулеймен", "CTR-004", "717307876391", ["DIR-ACS"]],
  ["Жания Омарова", "CTR-004", "690430062519", ["DIR-FACE"]],
  ["Бекзат Турсын", "CTR-004", "472016208983", ["DIR-FACE", "DIR-ACS"]],
  ["Алиса Рахимова", "CTR-004", "569217298749", ["DIR-ACS", "DIR-FACE"]],
];

let eventNumber = 0;
let assignmentNumber = 0;
const auditEvents = [];
const assignments = [];
const event = (type, entityType, entityId, newValue) => {
  eventNumber += 1;
  auditEvents.push({
    id: `EVT-${String(eventNumber).padStart(6, "0")}`,
    occurredAt: seedTimestamp,
    actor: { id: "SEED", role: "SYSTEM" },
    type,
    entityType,
    entityId,
    oldValue: null,
    newValue,
  });
};

companies.forEach((company) => event("company.created", "company", company.id, company));
const employees = people.map(([fullName, companyId, demoNumber, directionIds], index) => {
  const sequence = index + 1;
  const id = `EMP-${String(sequence).padStart(6, "0")}`;
  const createdAt = `2026-09-${String(10 + index).padStart(2, "0")}T09:00:00.000Z`;
  const employee = {
    id,
    fullName,
    demoNumber,
    companyId,
    status: "active",
    createdAt,
    updatedAt: createdAt,
    comments: [],
  };
  event("employee.created", "employee", id, employee);
  directionIds.forEach((directionId) => {
    assignmentNumber += 1;
    const assignment = {
      id: `ASN-${String(assignmentNumber).padStart(6, "0")}`,
      employeeId: id,
      companyId,
      directionId,
      startedAt: createdAt,
      endedAt: null,
      status: "active",
      comment: "Начальное демонстрационное назначение",
    };
    assignments.push(assignment);
    event("assignment.created", "assignment", assignment.id, assignment);
  });
  return employee;
});

const seed = {
  schemaVersion: 1,
  seedId: "techpass-contractor-registry-v1",
  demoOnly: true,
  generatedAt: seedTimestamp,
  directions,
  companies,
  employees,
  assignments,
  approvalRequests: [],
  auditEvents,
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(seed, null, 2)}\n`, "utf8");
process.stdout.write(`Wrote ${employees.length} employees, ${assignments.length} assignments and ${auditEvents.length} audit events to ${path.relative(process.cwd(), outputPath)}\n`);
