(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.TechPassRegistryCore = api;
})(typeof globalThis === "object" ? globalThis : this, function () {
  "use strict";

  const DEMO_COMPANY_POLICIES = Object.freeze({
    "CTR-001": Object.freeze(["DIR-FACE", "DIR-ACS"]),
    "CTR-002": Object.freeze(["DIR-FACE", "DIR-ACS"]),
    "CTR-003": Object.freeze(["DIR-FACE", "DIR-ACS"]),
    "CTR-004": Object.freeze(["DIR-FACE", "DIR-ACS"]),
  });

  function clone(value) {
    if (typeof structuredClone === "function") return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
  }

  function pad(value) {
    return String(value).padStart(6, "0");
  }

  function nextSequence(store, key, prefix, collection) {
    store.counters ||= {};
    const observed = collection.reduce((max, item) => {
      const match = new RegExp(`^${prefix}-(\\d+)$`).exec(item.id || "");
      return match ? Math.max(max, Number(match[1])) : max;
    }, 0);
    const next = Math.max(Number(store.counters[key] || 1), observed + 1);
    store.counters[key] = next + 1;
    return next;
  }

  function nextId(store, key, prefix, collection) {
    return `${prefix}-${pad(nextSequence(store, key, prefix, collection))}`;
  }

  function requireActor(actor, allowedRoles) {
    if (!actor || typeof actor.id !== "string" || !actor.id.trim()) throw new Error("Не указан пользователь демонстрационной роли.");
    if (!allowedRoles.includes(actor.role)) throw new Error(`Роль ${actor.role || "неизвестна"} не может выполнять это действие.`);
  }

  function getCompany(store, companyId) {
    const company = store.companies.find((item) => item.id === companyId);
    if (!company) throw new Error("Компания не найдена.");
    return company;
  }

  function getEmployee(store, employeeId) {
    const employee = store.employees.find((item) => item.id === employeeId);
    if (!employee) throw new Error("Сотрудник не найден.");
    return employee;
  }

  function validateDirectionIds(store, company, directionIds, { allowEmpty = false } = {}) {
    if (!Array.isArray(directionIds)) throw new Error("Выберите направления работ.");
    const unique = [...new Set(directionIds)];
    if (unique.length !== directionIds.length) throw new Error("Одно направление выбрано несколько раз.");
    if (!allowEmpty && unique.length < 1) throw new Error("Нужно выбрать хотя бы одно направление.");
    if (unique.length > 3) throw new Error("Сотруднику можно назначить не более трёх направлений.");
    if (unique.length > company.maxDirections) throw new Error(`${company.name}: максимум ${company.maxDirections} направлений.`);
    for (const directionId of unique) {
      const item = store.directions.find((candidate) => candidate.id === directionId);
      if (!item) throw new Error("Выбрано неизвестное направление.");
      if (!item.active) throw new Error("Нельзя назначить отключённое направление.");
      if (!company.allowedDirectionIds.includes(directionId)) throw new Error(`${company.name} не может назначать это направление.`);
    }
    return unique;
  }

  function generateDemoNumber(store) {
    const existing = new Set(store.employees.map((item) => item.demoNumber));
    for (let attempt = 0; attempt < 10000; attempt += 1) {
      const bytes = new Uint8Array(12);
      if (!globalThis.crypto?.getRandomValues) throw new Error("Для генерации уникального демо-номера требуется современный браузер.");
      globalThis.crypto.getRandomValues(bytes);
      const number = Array.from(bytes, (value) => String(value % 10)).join("");
      if (!existing.has(number)) return number;
    }
    throw new Error("Не удалось подобрать свободный демо-номер.");
  }

  function validateDemoNumber(store, number, exceptEmployeeId = null) {
    if (!/^\d{12}$/.test(number)) throw new Error("Демо-номер должен содержать ровно 12 цифр.");
    if (store.employees.some((employee) => employee.id !== exceptEmployeeId && employee.demoNumber === number)) {
      throw new Error("Такой демо-номер уже назначен другому сотруднику.");
    }
  }

  function addAuditEvent(store, actor, type, entityType, entityId, oldValue, newValue, now) {
    store.auditEvents ||= [];
    const id = nextId(store, "event", "EVT", store.auditEvents);
    store.auditEvents.push({
      id,
      occurredAt: now,
      actor: { id: actor.id, role: actor.role },
      type,
      entityType,
      entityId,
      oldValue: oldValue == null ? null : clone(oldValue),
      newValue: newValue == null ? null : clone(newValue),
    });
  }

  function createAssignments(store, employee, directionIds, actor, now, comment = "") {
    store.assignments ||= [];
    const created = [];
    for (const directionId of directionIds) {
      const id = nextId(store, "assignment", "ASN", store.assignments);
      const assignment = {
        id,
        employeeId: employee.id,
        companyId: employee.companyId,
        directionId,
        startedAt: now,
        endedAt: null,
        status: "active",
        comment,
      };
      store.assignments.push(assignment);
      addAuditEvent(store, actor, "assignment.created", "assignment", id, null, assignment, now);
      created.push(assignment);
    }
    return created;
  }

  function activeAssignments(store, employeeId) {
    return store.assignments.filter((item) => item.employeeId === employeeId && item.status === "active");
  }

  function installSeed(store, seed) {
    store.companies ||= [];
    store.directions ||= [];
    store.employees ||= [];
    store.assignments ||= [];
    store.auditEvents ||= [];
    store.approvalRequests ||= [];
    store.appliedSeedIds ||= [];
    store.counters ||= {};
    if (store.appliedSeedIds.includes(seed.seedId)) return { added: 0, alreadyInstalled: true };

    const collections = [
      ["companies", seed.companies],
      ["directions", seed.directions],
      ["employees", seed.employees],
      ["assignments", seed.assignments],
      ["auditEvents", seed.auditEvents],
    ];
    const staged = [];
    for (const [key, incoming] of collections) {
      const existing = new Set(store[key].map((item) => item.id));
      for (const item of incoming) {
        if (!existing.has(item.id)) staged.push([key, item]);
      }
    }
    const incomingNumbers = seed.employees.filter((employee) => !store.employees.some((item) => item.id === employee.id));
    for (const employee of incomingNumbers) {
      if (store.employees.some((item) => item.demoNumber === employee.demoNumber)) {
        throw new Error(`Номер ${employee.demoNumber} из начальных данных уже используется.`);
      }
    }
    for (const [key, item] of staged) store[key].push(clone(item));
    store.appliedSeedIds.push(seed.seedId);
    return { added: staged.length, alreadyInstalled: false };
  }

  function createEmployee(store, input, actor, now = new Date().toISOString()) {
    requireActor(actor, ["IT_ADMIN"]);
    const fullName = String(input.fullName || "").trim().replace(/\s+/g, " ");
    if (fullName.length < 3) throw new Error("Укажите ФИО сотрудника.");
    const company = getCompany(store, input.companyId);
    if (company.status !== "active") throw new Error("Нельзя добавить сотрудника в неактивную компанию.");
    const directionIds = validateDirectionIds(store, company, input.directionIds);
    const demoNumber = input.demoNumber == null || input.demoNumber === "" ? generateDemoNumber(store) : String(input.demoNumber).trim();
    validateDemoNumber(store, demoNumber);
    const employee = {
      id: nextId(store, "employee", "EMP", store.employees),
      fullName,
      demoNumber,
      companyId: company.id,
      status: "active",
      createdAt: now,
      updatedAt: now,
      comments: input.comment ? [String(input.comment).trim()] : [],
    };
    store.employees.push(employee);
    addAuditEvent(store, actor, "employee.created", "employee", employee.id, null, employee, now);
    createAssignments(store, employee, directionIds, actor, now, "Начальное назначение");
    return employee;
  }

  function updateEmployee(store, employeeId, changes, actor, now = new Date().toISOString()) {
    requireActor(actor, ["IT_ADMIN"]);
    const employee = getEmployee(store, employeeId);
    const oldValue = clone(employee);
    if (changes.fullName != null) {
      const fullName = String(changes.fullName).trim().replace(/\s+/g, " ");
      if (fullName.length < 3) throw new Error("Укажите ФИО сотрудника.");
      employee.fullName = fullName;
    }
    if (changes.demoNumber != null) {
      const demoNumber = String(changes.demoNumber).trim();
      validateDemoNumber(store, demoNumber, employee.id);
      employee.demoNumber = demoNumber;
    }
    if (changes.comment != null && String(changes.comment).trim()) employee.comments.push(String(changes.comment).trim());
    if (changes.status != null) {
      if (!["active", "inactive"].includes(changes.status)) throw new Error("Неизвестный статус сотрудника.");
      if (employee.status !== changes.status && changes.status === "inactive") {
        for (const assignment of activeAssignments(store, employee.id)) {
          assignment.status = "closed";
          assignment.endedAt = now;
          assignment.comment = assignment.comment || "Сотрудник переведён в неактивный статус";
          addAuditEvent(store, actor, "assignment.closed", "assignment", assignment.id, { status: "active", endedAt: null }, assignment, now);
        }
      } else if (employee.status !== changes.status && changes.status === "active" && activeAssignments(store, employee.id).length === 0) {
        throw new Error("Для повторной активации сначала создайте хотя бы одно назначение.");
      }
      employee.status = changes.status;
    }
    employee.updatedAt = now;
    addAuditEvent(store, actor, "employee.updated", "employee", employee.id, oldValue, employee, now);
    return employee;
  }

  function setEmployeeDirections(store, employeeId, directionIds, actor, now = new Date().toISOString(), comment = "Изменение назначений") {
    requireActor(actor, ["IT_ADMIN"]);
    const employee = getEmployee(store, employeeId);
    if (employee.status !== "active") throw new Error("Нельзя назначить направления неактивному сотруднику.");
    const company = getCompany(store, employee.companyId);
    const requested = validateDirectionIds(store, company, directionIds);
    const current = activeAssignments(store, employee.id);
    const currentIds = new Set(current.map((item) => item.directionId));
    const requestedIds = new Set(requested);
    if (currentIds.size === requestedIds.size && [...currentIds].every((id) => requestedIds.has(id))) return current;

    for (const assignment of current) {
      if (requestedIds.has(assignment.directionId)) continue;
      assignment.status = "closed";
      assignment.endedAt = now;
      assignment.comment = comment;
      addAuditEvent(store, actor, "assignment.closed", "assignment", assignment.id, { status: "active", endedAt: null }, assignment, now);
    }
    const added = requested.filter((id) => !currentIds.has(id));
    createAssignments(store, employee, added, actor, now, comment);
    employee.updatedAt = now;
    addAuditEvent(store, actor, "employee.directions.updated", "employee", employee.id, [...currentIds], requested, now);
    return activeAssignments(store, employee.id);
  }

  function changeEmployeeCompany(store, employeeId, companyId, directionIds, actor, now = new Date().toISOString()) {
    requireActor(actor, ["IT_ADMIN"]);
    const employee = getEmployee(store, employeeId);
    const company = getCompany(store, companyId);
    if (company.status !== "active") throw new Error("Нельзя перевести сотрудника в неактивную компанию.");
    const requested = validateDirectionIds(store, company, directionIds, { allowEmpty: employee.status !== "active" });
    const oldCompanyId = employee.companyId;
    if (oldCompanyId === company.id) return setEmployeeDirections(store, employeeId, requested, actor, now, "Изменение назначений");

    const oldAssignments = activeAssignments(store, employee.id);
    for (const assignment of oldAssignments) {
      assignment.status = "closed";
      assignment.endedAt = now;
      assignment.comment = "Закрыто при смене компании";
      addAuditEvent(store, actor, "assignment.closed", "assignment", assignment.id, { status: "active", endedAt: null }, assignment, now);
    }
    employee.companyId = company.id;
    employee.updatedAt = now;
    if (employee.status === "active") createAssignments(store, employee, requested, actor, now, "Назначение после смены компании");
    addAuditEvent(store, actor, "employee.company.changed", "employee", employee.id, oldCompanyId, company.id, now);
    return employee;
  }

  function createCompany(store, input, actor, now = new Date().toISOString()) {
    requireActor(actor, ["IT_ADMIN"]);
    const name = String(input.name || "").trim();
    if (name.length < 2) throw new Error("Укажите название компании.");
    if (store.companies.some((company) => company.name.toLocaleLowerCase() === name.toLocaleLowerCase())) throw new Error("Компания с таким названием уже есть.");
    const allowedDirectionIds = [...new Set(input.allowedDirectionIds || [])];
    if (allowedDirectionIds.length < 1) throw new Error("Добавьте хотя бы одно разрешённое направление.");
    if (allowedDirectionIds.length > 3) throw new Error("Компании нельзя разрешить больше трёх направлений в демо-реестре.");
    for (const id of allowedDirectionIds) {
      const item = store.directions.find((direction) => direction.id === id);
      if (!item) throw new Error("Выбрано неизвестное направление.");
      if (!item.active) throw new Error("Нельзя разрешить компании отключённое направление.");
    }
    const maxDirections = Number(input.maxDirections || 3);
    if (!Number.isInteger(maxDirections) || maxDirections < 1 || maxDirections > allowedDirectionIds.length) throw new Error("Максимум направлений должен соответствовать списку разрешённых направлений.");
    const company = {
      id: `CTR-${String(nextSequence(store, "company", "CTR", store.companies)).padStart(3, "0")}`,
      name,
      status: "active",
      allowedDirectionIds,
      maxDirections,
      createdAt: now,
      updatedAt: now,
    };
    store.companies.push(company);
    addAuditEvent(store, actor, "company.created", "company", company.id, null, company, now);
    return company;
  }

  function createDirection(store, nameValue, actor, now = new Date().toISOString()) {
    requireActor(actor, ["IT_ADMIN"]);
    const name = String(nameValue || "").trim();
    if (name.length < 2) throw new Error("Укажите название направления.");
    if (store.directions.some((item) => item.name.toLocaleLowerCase() === name.toLocaleLowerCase())) throw new Error("Такое направление уже есть.");
    const item = {
      id: nextId(store, "direction", "DIR-EXT", store.directions),
      name,
      active: true,
      createdAt: now,
      updatedAt: now,
    };
    store.directions.push(item);
    addAuditEvent(store, actor, "direction.created", "direction", item.id, null, item, now);
    return item;
  }

  function setEmployeeStatus(store, employeeId, status, directionIds, actor, now = new Date().toISOString()) {
    requireActor(actor, ["IT_ADMIN"]);
    const employee = getEmployee(store, employeeId);
    if (!["active", "inactive"].includes(status)) throw new Error("Неизвестный статус сотрудника.");
    if (employee.status === status) return employee;
    if (status === "inactive") return updateEmployee(store, employeeId, { status }, actor, now);

    const company = getCompany(store, employee.companyId);
    if (company.status !== "active") throw new Error("Нельзя активировать сотрудника в неактивной компании.");
    const selected = validateDirectionIds(store, company, directionIds);
    const oldStatus = employee.status;
    employee.status = "active";
    employee.updatedAt = now;
    createAssignments(store, employee, selected, actor, now, "Назначение при повторной активации");
    addAuditEvent(store, actor, "employee.status.changed", "employee", employee.id, oldStatus, "active", now);
    return employee;
  }

  function updateEmployeeProfile(store, employeeId, changes, actor, now = new Date().toISOString()) {
    requireActor(actor, ["IT_ADMIN"]);
    const working = clone(store);
    const employee = getEmployee(working, employeeId);
    const oldCompanyId = employee.companyId;
    const oldStatus = employee.status;
    updateEmployee(working, employeeId, {
      fullName: changes.fullName,
      demoNumber: changes.demoNumber,
      comment: changes.comment,
    }, actor, now);
    if (oldStatus === "active" && changes.status === "inactive") setEmployeeStatus(working, employeeId, "inactive", [], actor, now);
    if (oldCompanyId !== changes.companyId) changeEmployeeCompany(working, employeeId, changes.companyId, changes.directionIds, actor, now);
    if (oldStatus === "inactive" && changes.status === "active") setEmployeeStatus(working, employeeId, "active", changes.directionIds, actor, now);
    else if (oldStatus === "active" && changes.status === "active" && oldCompanyId === changes.companyId) setEmployeeDirections(working, employeeId, changes.directionIds, actor, now);
    const errors = assertStoreInvariants(working);
    if (errors.length) throw new Error(`Изменения нарушают правила реестра: ${errors.join("; ")}`);
    for (const key of Object.keys(store)) if (!Object.hasOwn(working, key)) delete store[key];
    Object.assign(store, working);
    return getEmployee(store, employeeId);
  }

  function updateCompany(store, companyId, changes, actor, now = new Date().toISOString()) {
    requireActor(actor, ["IT_ADMIN"]);
    const company = getCompany(store, companyId);
    const before = clone(company);
    const nextAllowed = changes.allowedDirectionIds == null ? company.allowedDirectionIds : [...new Set(changes.allowedDirectionIds)];
    const nextMax = changes.maxDirections == null ? company.maxDirections : Number(changes.maxDirections);
    for (const id of nextAllowed) {
      const item = store.directions.find((direction) => direction.id === id);
      if (!item) throw new Error("Выбрано неизвестное направление.");
      if (!item.active) throw new Error("Нельзя разрешить компании отключённое направление.");
    }
    if (nextAllowed.length < 1 || nextAllowed.length > 3 || nextMax < 1 || nextMax > nextAllowed.length) throw new Error("Некорректные ограничения компании.");
    const pinnedPolicy = DEMO_COMPANY_POLICIES[company.id];
    if (pinnedPolicy && (nextMax > 2 || nextAllowed.some((id) => !pinnedPolicy.includes(id)))) {
      throw new Error(`${company.name}: доступны только Face ID и СКУД, максимум два направления.`);
    }
    for (const employee of store.employees.filter((item) => item.companyId === company.id && item.status === "active")) {
      const assignedIds = activeAssignments(store, employee.id).map((item) => item.directionId);
      if (assignedIds.length > nextMax || assignedIds.some((id) => !nextAllowed.includes(id))) {
        throw new Error(`Сначала исправьте назначения сотрудника ${employee.fullName}; новые ограничения нарушают его текущие направления.`);
      }
    }
    if (changes.name != null) {
      const name = String(changes.name).trim();
      if (name.length < 2) throw new Error("Укажите название компании.");
      if (store.companies.some((item) => item.id !== company.id && item.name.toLocaleLowerCase() === name.toLocaleLowerCase())) throw new Error("Компания с таким названием уже есть.");
      company.name = name;
    }
    if (changes.status != null) {
      if (!["active", "inactive"].includes(changes.status)) throw new Error("Неизвестный статус компании.");
      company.status = changes.status;
    }
    company.allowedDirectionIds = nextAllowed;
    company.maxDirections = nextMax;
    company.updatedAt = now;
    addAuditEvent(store, actor, "company.updated", "company", company.id, before, company, now);
    return company;
  }

  function searchEmployees(store, query) {
    const needle = String(query || "").trim().toLocaleLowerCase();
    if (!needle) return store.employees.slice();
    const companyNames = new Map(store.companies.map((item) => [item.id, item.name]));
    const directionNames = new Map(store.directions.map((item) => [item.id, item.name]));
    return store.employees.filter((employee) => {
      const values = [employee.fullName, employee.id, employee.demoNumber, companyNames.get(employee.companyId) || ""];
      for (const assignment of store.assignments.filter((item) => item.employeeId === employee.id)) {
        values.push(assignment.directionId, directionNames.get(assignment.directionId) || "");
        values.push(companyNames.get(assignment.companyId) || "");
      }
      return values.some((value) => value.toLocaleLowerCase().includes(needle));
    });
  }

  function requestApproval(store, employeeId, requestText, actor, now = new Date().toISOString()) {
    requireActor(actor, ["IT_ADMIN"]);
    const employee = getEmployee(store, employeeId);
    const description = String(requestText || "").trim();
    if (description.length < 5) throw new Error("Опишите запрашиваемое специальное право.");
    store.approvalRequests ||= [];
    const request = {
      id: nextId(store, "approval", "APR", store.approvalRequests),
      employeeId,
      requestedBy: { id: actor.id, role: actor.role },
      reviewedBy: null,
      requestText: description,
      status: "pending",
      createdAt: now,
      decidedAt: null,
      decisionComment: "",
    };
    store.approvalRequests.push(request);
    addAuditEvent(store, actor, "approval.requested", "approval", request.id, null, request, now);
    return request;
  }

  function decideApproval(store, requestId, decision, comment, actor, now = new Date().toISOString()) {
    requireActor(actor, ["SECURITY_MANAGER"]);
    const request = store.approvalRequests.find((item) => item.id === requestId);
    if (!request) throw new Error("Запрос не найден.");
    if (request.status !== "pending") throw new Error("Запрос уже рассмотрен.");
    if (request.requestedBy.id === actor.id) throw new Error("Инициатор не может согласовать собственный запрос.");
    if (!["approved", "rejected"].includes(decision)) throw new Error("Выберите решение.");
    const oldValue = clone(request);
    request.status = decision;
    request.reviewedBy = { id: actor.id, role: actor.role };
    request.decidedAt = now;
    request.decisionComment = String(comment || "").trim();
    addAuditEvent(store, actor, `approval.${decision}`, "approval", request.id, oldValue, request, now);
    return request;
  }

  function assertStoreInvariants(store) {
    const errors = [];
    const companies = new Map(store.companies.map((item) => [item.id, item]));
    const employees = new Map(store.employees.map((item) => [item.id, item]));
    const directions = new Set(store.directions.map((item) => item.id));
    const unique = (items, key) => new Set(items.map((item) => item[key])).size === items.length;
    if (!unique(store.employees, "id")) errors.push("Дублируются EMP-ID.");
    if (!unique(store.employees, "demoNumber")) errors.push("Дублируются 12-значные номера.");
    if (!unique(store.assignments, "id")) errors.push("Дублируются ID назначений.");
    if (!unique(store.auditEvents, "id")) errors.push("Дублируются ID событий.");
    for (const employee of store.employees) {
      const company = companies.get(employee.companyId);
      if (!company) { errors.push(`${employee.id}: неизвестная компания.`); continue; }
      if (!/^\d{12}$/.test(employee.demoNumber)) errors.push(`${employee.id}: неверный формат демо-номера.`);
      const active = activeAssignments(store, employee.id);
      if (employee.status === "active" && (active.length < 1 || active.length > Math.min(3, company.maxDirections))) errors.push(`${employee.id}: нарушено количество активных направлений.`);
      if (employee.status !== "active" && active.length) errors.push(`${employee.id}: у неактивного сотрудника остались активные назначения.`);
      const seen = new Set();
      for (const assignment of active) {
        if (assignment.companyId !== employee.companyId) errors.push(`${assignment.id}: компания назначения не совпадает с текущей.`);
        if (!directions.has(assignment.directionId)) errors.push(`${assignment.id}: неизвестное направление.`);
        if (!company.allowedDirectionIds.includes(assignment.directionId)) errors.push(`${company.id}: запрещённое направление ${assignment.directionId}.`);
        if (seen.has(assignment.directionId)) errors.push(`${employee.id}: повторное направление ${assignment.directionId}.`);
        seen.add(assignment.directionId);
      }
    }
    for (const assignment of store.assignments) {
      if (!employees.has(assignment.employeeId)) errors.push(`${assignment.id}: неизвестный сотрудник.`);
      const assignedCompany = companies.get(assignment.companyId);
      if (!assignedCompany) errors.push(`${assignment.id}: неизвестная компания.`);
      if (!directions.has(assignment.directionId)) errors.push(`${assignment.id}: неизвестное направление.`);
      if (assignment.status === "active" && assignment.endedAt) errors.push(`${assignment.id}: активное назначение имеет дату завершения.`);
      if (assignment.status !== "active" && !assignment.endedAt) errors.push(`${assignment.id}: закрытое назначение без даты завершения.`);
      if (assignment.status === "active" && assignedCompany && directions.has(assignment.directionId) && !assignedCompany.allowedDirectionIds.includes(assignment.directionId)) errors.push(`${assignment.id}: назначение запрещено политикой компании.`);
    }
    for (const company of store.companies) {
      const pinned = DEMO_COMPANY_POLICIES[company.id];
      if (pinned && (company.maxDirections > 2 || company.allowedDirectionIds.some((id) => !pinned.includes(id)))) errors.push(`${company.id}: изменено обязательное ограничение Face ID / СКУД.`);
    }
    return errors;
  }

  return Object.freeze({
    DEMO_COMPANY_POLICIES,
    clone,
    installSeed,
    createEmployee,
    updateEmployee,
    setEmployeeDirections,
    changeEmployeeCompany,
    createCompany,
    createDirection,
    updateCompany,
    setEmployeeStatus,
    updateEmployeeProfile,
    searchEmployees,
    requestApproval,
    decideApproval,
    activeAssignments,
    assertStoreInvariants,
  });
});
