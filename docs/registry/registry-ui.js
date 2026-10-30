(function () {
  "use strict";

  const core = window.TechPassRegistryCore;
  const STORAGE_KEY = "techpass.contractor-registry.v1";
  const roles = {
    IT_ADMIN: { id: "demo-it-admin", role: "IT_ADMIN", label: "IT_ADMIN" },
    SECURITY_MANAGER: { id: "demo-security-manager", role: "SECURITY_MANAGER", label: "SECURITY_MANAGER" },
    TECHNICIAN: { id: "demo-technician", role: "TECHNICIAN", label: "TECHNICIAN" },
    USER: { id: "demo-user", role: "USER", label: "USER" },
  };
  let state = null;
  let currentView = "overview";
  let previousView = "employees";
  let selectedEmployeeId = null;
  let camera = null;
  let cameraRunning = false;
  let cameraStarting = null;
  let workbookRows = null;
  let importPreview = null;
  let toastTimer = null;

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
  const role = () => roles[$("#role-select").value] || roles.IT_ADMIN;
  const isAdmin = () => role().label === "IT_ADMIN";
  const isManager = () => role().label === "SECURITY_MANAGER";
  const now = () => new Date().toISOString();
  const fmtDate = (value) => value ? new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium" }).format(new Date(value)) : "—";
  const fmtDateTime = (value) => value ? new Intl.DateTimeFormat("ru-RU", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)) : "—";
  const company = (id) => state.companies.find((item) => item.id === id);
  const direction = (id) => state.directions.find((item) => item.id === id);
  const employee = (id) => state.employees.find((item) => item.id === id);
  const activeAssignments = (id) => core.activeAssignments(state, id);
  const employeeDirections = (id) => [...new Set(activeAssignments(id).map((item) => item.directionId))];
  const allowedEmployee = (item) => Boolean(item) && (role().label !== "TECHNICIAN" || item.id === "EMP-000001");

  function showToast(message, kind = "success") {
    let toast = $("#toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "toast";
      toast.className = "toast";
      document.body.append(toast);
    }
    toast.textContent = message;
    toast.dataset.kind = kind;
    toast.classList.add("visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("visible"), 3600);
  }

  function save() {
    state.updatedAt = now();
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      showToast(`Не удалось сохранить данные в браузере: ${error.message}`, "error");
      throw error;
    }
  }

  async function initialize() {
    if (!core) throw new Error("Не загрузился модуль правил реестра.");
    const seedResponse = await fetch("./data/registry-seed.json", { cache: "no-store" });
    if (!seedResponse.ok) throw new Error("Не удалось загрузить начальные демонстрационные данные.");
    const seed = await seedResponse.json();
    try {
      state = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    } catch {
      localStorage.removeItem(STORAGE_KEY);
      state = null;
    }
    if (!state) {
      state = { schemaVersion: 1, companies: [], directions: [], employees: [], assignments: [], auditEvents: [], approvalRequests: [], appliedSeedIds: [], counters: {} };
    }
    const installed = core.installSeed(state, seed);
    if (!state.schemaVersion) state.schemaVersion = 1;
    if (!state.appliedSeedIds) state.appliedSeedIds = [seed.seedId];
    if (installed.added || !localStorage.getItem(STORAGE_KEY)) save();
    if (!state.preferences) state.preferences = {};
    $("#role-select").value = state.preferences.role || "IT_ADMIN";
    render();
  }

  async function setView(view) {
    if (currentView === "scan") await stopCamera();
    currentView = view;
    selectedEmployeeId = null;
    $$(".nav-item").forEach((button) => button.classList.toggle("active", button.dataset.view === view));
    render();
    $("#sidebar").classList.remove("open");
  }

  function render() {
    if (!state) return;
    const main = $("#main-content");
    const views = {
      overview: renderOverview,
      companies: renderCompanies,
      employees: renderEmployees,
      directions: renderDirections,
      assignments: renderAssignments,
      import: renderImport,
      scan: renderScan,
      audit: renderAudit,
      approvals: renderApprovals,
      "employee-detail": renderEmployeeDetail,
    };
    main.innerHTML = (views[currentView] || renderOverview)();
    if (currentView === "scan") mountCameraReader();
  }

  function heading(eyebrow, title, subtitle, action = "") {
    return `<div class="page-heading"><div><p class="eyebrow">${escapeHtml(eyebrow)}</p><h1>${escapeHtml(title)}</h1>${subtitle ? `<p class="subtitle">${escapeHtml(subtitle)}</p>` : ""}</div>${action}</div>`;
  }

  function button(label, action, extra = "") {
    return `<button class="button ${extra}" type="button" data-action="${escapeHtml(action)}">${label}</button>`;
  }

  function roleMessage() {
    if (isAdmin()) return "Доступна демонстрация управления компаниями, сотрудниками и назначениями.";
    if (isManager()) return "Доступны просмотр реестра и обработка запросов согласования.";
    if (role().label === "TECHNICIAN") return "Показан условный собственный профиль EMP-000001. Это демонстрационный выбор, не вход в аккаунт.";
    return "Доступен просмотр вымышленных данных реестра.";
  }

  function renderOverview() {
    const active = state.employees.filter((item) => item.status === "active").length;
    const pending = state.approvalRequests.filter((item) => item.status === "pending").length;
    const events = [...state.auditEvents].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)).slice(0, 7);
    return `${heading("ПАНЕЛЬ РЕЕСТРА", "Обзор", roleMessage(), isAdmin() ? button("＋ Добавить специалиста", "employee-create") : "")}
      <div class="grid stats">
        <article class="stat-card"><div class="stat-label">Подрядные организации</div><div class="stat-value">${state.companies.length}</div><div class="stat-note">Компании в демо-справочнике</div></article>
        <article class="stat-card"><div class="stat-label">Специалисты</div><div class="stat-value">${state.employees.length}</div><div class="stat-note">${active} активных профилей</div></article>
        <article class="stat-card"><div class="stat-label">Текущие назначения</div><div class="stat-value">${state.assignments.filter((item) => item.status === "active").length}</div><div class="stat-note">История хранится отдельно</div></article>
        <article class="stat-card"><div class="stat-label">Ожидают решения</div><div class="stat-value">${pending}</div><div class="stat-note">Демо-запросы на специальные права</div></article>
      </div>
      <div class="two-column">
        <section class="panel"><div class="panel-heading"><div><h2>Подрядчики</h2><p>Разрешённые направления проверяются перед каждым назначением.</p></div>${button("Все компании →", "navigate-companies", "secondary small")}</div>${companyCards(state.companies.slice(0, 4))}</section>
        <section class="panel"><div class="panel-heading"><div><h2>Последние события</h2><p>Изменения, назначения и согласования.</p></div>${button("Журнал →", "navigate-audit", "secondary small")}</div>${eventTimeline(events)}</section>
      </div>
      <p class="footer-note">${escapeHtml(roleMessage())} Профили и идентификационные номера вымышлены; данные остаются в хранилище этого браузера.</p>`;
  }

  function companyCards(items) {
    if (!items.length) return `<div class="empty">Компаний пока нет.</div>`;
    return `<div class="company-grid">${items.map((item) => {
      const count = state.employees.filter((person) => person.companyId === item.id).length;
      const directionTags = item.allowedDirectionIds.map((id) => `<span class="tag direction">${escapeHtml(direction(id)?.name || id)}</span>`).join("");
      return `<article class="company-card"><div class="company-card-top"><div><h3>${escapeHtml(item.name)}</h3><div class="company-code">${escapeHtml(item.id)}</div></div><span class="tag ${item.status === "active" ? "ok" : "bad"}">${item.status === "active" ? "Активна" : "Неактивна"}</span></div><div class="company-meta"><span class="tag">${count} специалист(ов)</span><span class="tag">Максимум ${item.maxDirections}</span></div><div class="company-meta">${directionTags}</div>${isAdmin() ? `<div class="company-meta">${button("Изменить компанию", `company-edit:${item.id}`, "secondary small")}</div>` : ""}</article>`;
    }).join("")}</div>`;
  }

  function eventTitle(event) {
    const map = {
      "employee.created": "Создан профиль сотрудника",
      "employee.updated": "Изменён профиль сотрудника",
      "employee.company.changed": "Смена компании",
      "employee.directions.updated": "Изменены направления",
      "assignment.created": "Создано назначение",
      "assignment.closed": "Назначение закрыто",
      "company.created": "Добавлена компания",
      "company.updated": "Изменена компания",
      "approval.requested": "Создан запрос на согласование",
      "approval.approved": "Запрос согласован",
      "approval.rejected": "Запрос отклонён",
      "import.completed": "Завершён импорт Excel",
    };
    return map[event.type] || event.type;
  }

  function eventTimeline(items) {
    if (!items.length) return `<div class="empty">Событий пока нет.</div>`;
    return `<ul class="timeline">${items.map((item) => `<li class="timeline-item"><strong>${escapeHtml(eventTitle(item))} · ${escapeHtml(item.entityId)}</strong><small>${escapeHtml(fmtDateTime(item.occurredAt))} · ${escapeHtml(item.actor?.role || "SYSTEM")}</small></li>`).join("")}</ul>`;
  }

  function renderCompanies() {
    const action = isAdmin() ? button("＋ Добавить компанию", "company-create") : "";
    return `${heading("СПРАВОЧНИК", "Компании", "Четыре исходные компании ограничены направлениями Face ID и СКУД.", action)}
      <div class="notice">Изменение состава разрешённых направлений у CTR-001—CTR-004 заблокировано. Для нового типа работ добавьте отдельную компанию и задайте ей разрешённый список.</div>
      <section class="panel">${companyCards(state.companies)}</section>`;
  }

  function directionUsage(directionId) {
    return state.assignments.filter((item) => item.directionId === directionId && item.status === "active").length;
  }

  function renderDirections() {
    const action = isAdmin() ? button("＋ Добавить направление", "direction-create") : "";
    return `${heading("СПРАВОЧНИК", "Направления работ", "Справочник можно расширять; конкретные назначения ограничиваются политикой компании.", action)}
      <section class="panel"><div class="table-wrap"><table><thead><tr><th>ID</th><th>Направление</th><th>Статус</th><th>Текущих назначений</th><th>Разрешено компаниям</th></tr></thead><tbody>
        ${state.directions.map((item) => {
          const companies = state.companies.filter((companyItem) => companyItem.allowedDirectionIds.includes(item.id)).map((companyItem) => companyItem.name);
          return `<tr><td><code>${escapeHtml(item.id)}</code></td><td class="table-name">${escapeHtml(item.name)}</td><td><span class="tag ${item.active ? "ok" : "bad"}">${item.active ? "Активно" : "Отключено"}</span></td><td>${directionUsage(item.id)}</td><td>${companies.length ? companies.map(escapeHtml).join(", ") : "Не назначается компаниям"}</td></tr>`;
        }).join("")}
      </tbody></table></div></section>`;
  }

  function employeeRow(item) {
    const companyItem = company(item.companyId);
    const dirs = employeeDirections(item.id).map((id) => direction(id)?.name || id).join(", ") || "—";
    return `<tr><td><span class="table-name">${escapeHtml(item.fullName)}</span><div class="employee-id">${escapeHtml(item.id)}</div></td><td>${escapeHtml(companyItem?.name || "—")}</td><td>${escapeHtml(dirs)}</td><td><code>${escapeHtml(item.demoNumber)}</code></td><td><span class="tag ${item.status === "active" ? "ok" : "bad"}">${item.status === "active" ? "Активен" : "Неактивен"}</span></td><td><div class="table-actions">${button("Профиль", `employee-open:${item.id}`, "secondary small")}${button("QR", `employee-qr:${item.id}`, "secondary small")}${isAdmin() ? button("Изменить", `employee-edit:${item.id}`, "secondary small") : ""}</div></td></tr>`;
  }

  function renderEmployees(filter = "") {
    const action = isAdmin() ? button("＋ Добавить специалиста", "employee-create") : "";
    const list = core.searchEmployees(state, filter).filter(allowedEmployee);
    return `${heading("РЕЕСТР", "Специалисты", "Поиск по ФИО, EMP-ID, демо-номеру, компании или направлению.", action)}
      <section class="panel">
        <div class="toolbar"><input id="employee-search" class="control" type="search" placeholder="Например, EMP-000042 или Face ID" value="${escapeHtml(filter)}" autocomplete="off"><select id="company-filter" class="control"><option value="">Все компании</option>${state.companies.map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`).join("")}</select><select id="status-filter" class="control"><option value="">Любой статус</option><option value="active">Активен</option><option value="inactive">Неактивен</option></select></div>
        <div class="table-wrap"><table><thead><tr><th>Специалист</th><th>Компания</th><th>Направления</th><th>Демо-номер</th><th>Статус</th><th>Действия</th></tr></thead><tbody id="employee-table-body">${list.map(employeeRow).join("") || `<tr><td colspan="6"><div class="empty">По этому запросу ничего не найдено.</div></td></tr>`}</tbody></table></div>
      </section>`;
  }

  function renderEmployeeDetail() {
    const item = employee(selectedEmployeeId);
    if (!item || !allowedEmployee(item)) return `${heading("РЕЕСТР", "Профиль недоступен", "Для выбранной демонстрационной роли этот профиль скрыт.")}${button("← К списку", "employee-back", "secondary")}`;
    const companyItem = company(item.companyId);
    const dirs = employeeDirections(item.id);
    const assignments = state.assignments.filter((assignment) => assignment.employeeId === item.id).sort((a, b) => b.startedAt.localeCompare(a.startedAt));
    const events = state.auditEvents.filter((event) => (event.entityType === "employee" && event.entityId === item.id) || (event.entityType === "assignment" && assignments.some((assignment) => assignment.id === event.entityId))).sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
    const actions = `${button("← Назад", "employee-back", "secondary")}${button("Показать QR", `employee-qr:${item.id}`, "gold")}${isAdmin() ? button("Изменить профиль", `employee-edit:${item.id}`, "") : ""}${isAdmin() ? button("Запросить специальное право", `approval-create:${item.id}`, "secondary") : ""}`;
    return `${heading("ПРОФИЛЬ СПЕЦИАЛИСТА", item.fullName, `Постоянный внутренний ID · ${item.id}`, actions)}
      <div class="two-column">
        <div>
          <section class="panel"><div class="panel-heading"><div><h2>Идентификация</h2><p>Демо-номер случайный, не является реальным ИИН.</p></div><span class="tag ${item.status === "active" ? "ok" : "bad"}">${item.status === "active" ? "Активен" : "Неактивен"}</span></div>
            <div class="company-meta"><span class="tag company">${escapeHtml(companyItem?.name || "Компания не найдена")}</span>${dirs.map((id) => `<span class="tag direction">${escapeHtml(direction(id)?.name || id)}</span>`).join("")}<span class="tag number">${escapeHtml(item.demoNumber)}</span></div>
            <div class="form-grid" style="margin-top:18px"><div><div class="eyebrow">КОМПАНИЯ</div><strong>${escapeHtml(companyItem?.name || "—")}</strong></div><div><div class="eyebrow">ДОБАВЛЕН</div><strong>${escapeHtml(fmtDate(item.createdAt))}</strong></div><div class="span-2" style="margin-top:14px"><div class="eyebrow">ТЕКУЩИЕ НАПРАВЛЕНИЯ</div><strong>${escapeHtml(dirs.map((id) => direction(id)?.name || id).join(" · ") || "Нет активных направлений")}</strong></div></div>
            ${item.comments?.length ? `<div style="margin-top:16px"><div class="eyebrow">КОММЕНТАРИИ</div><ul>${item.comments.map((comment) => `<li>${escapeHtml(comment)}</li>`).join("")}</ul></div>` : ""}
          </section>
          <section class="panel"><div class="panel-heading"><div><h2>История назначений</h2><p>Закрытые записи сохраняются при изменении компании и направлений.</p></div></div>
            <div class="table-wrap"><table><thead><tr><th>Компания</th><th>Направление</th><th>Начало</th><th>Окончание</th><th>Статус</th></tr></thead><tbody>${assignments.map((assignment) => `<tr><td>${escapeHtml(company(assignment.companyId)?.name || assignment.companyId)}</td><td>${escapeHtml(direction(assignment.directionId)?.name || assignment.directionId)}</td><td>${escapeHtml(fmtDate(assignment.startedAt))}</td><td>${escapeHtml(fmtDate(assignment.endedAt))}</td><td>${assignment.status === "active" ? `<span class="tag ok">Активно</span>` : `<span class="tag">Закрыто</span>`}</td></tr>`).join("") || `<tr><td colspan="5">Нет назначений.</td></tr>`}</tbody></table></div>
          </section>
        </div>
        <section class="panel"><div class="panel-heading"><div><h2>История изменений</h2><p>События, связанные с сотрудником.</p></div></div>${eventTimeline(events)}</section>
      </div>`;
  }

  function renderAssignments() {
    const items = [...state.assignments].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
    return `${heading("УЧЁТ РАБОТ", "Назначения", "Назначения хранятся отдельными записями; закрытые не удаляются.")}
      <section class="panel"><div class="toolbar"><select id="assignment-company-filter" class="control"><option value="">Все компании</option>${state.companies.map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`).join("")}</select><select id="assignment-status-filter" class="control"><option value="">Все назначения</option><option value="active">Активные</option><option value="closed">Закрытые</option></select></div>
      <div class="table-wrap"><table><thead><tr><th>Специалист</th><th>EMP-ID</th><th>Компания</th><th>Направление</th><th>С</th><th>По</th><th>Статус</th></tr></thead><tbody id="assignments-body">${items.map((item) => `<tr data-company="${escapeHtml(item.companyId)}" data-status="${escapeHtml(item.status)}"><td>${button(escapeHtml(employee(item.employeeId)?.fullName || "Сотрудник не найден"), `employee-open:${item.employeeId}`, "secondary small")}</td><td><code>${escapeHtml(item.employeeId)}</code></td><td>${escapeHtml(company(item.companyId)?.name || item.companyId)}</td><td>${escapeHtml(direction(item.directionId)?.name || item.directionId)}</td><td>${escapeHtml(fmtDate(item.startedAt))}</td><td>${escapeHtml(fmtDate(item.endedAt))}</td><td>${item.status === "active" ? `<span class="tag ok">Активно</span>` : `<span class="tag">Закрыто</span>`}</td></tr>`).join("")}</tbody></table></div></section>`;
  }

  function renderImport() {
    if (!isAdmin()) return `${heading("ИНСТРУМЕНТЫ", "Импорт Excel", "Импорт доступен только в демонстрационном режиме IT_ADMIN.")}${roleNotice()}`;
    return `${heading("ИНСТРУМЕНТЫ", "Импорт Excel", "Загрузка → сопоставление колонок → проверка → предварительный просмотр → подтверждение.", button("Скачать шаблон Excel", "import-template", "secondary"))}
      <section class="panel"><div class="notice">Импорт добавляет только новые записи. Повторяющиеся EMP-ID и демо-номера будут отмечены в предпросмотре; существующие назначения не перезаписываются, отсутствующие в файле сотрудники не удаляются.</div>
        <div class="field" style="max-width:560px;margin-top:18px"><label for="import-file">Файл Excel (.xlsx)</label><input id="import-file" class="control" type="file" accept=".xlsx,.xls,.csv"></div>
        <div id="import-workspace"><div class="empty">Выберите файл или скачайте шаблон.</div></div>
      </section>`;
  }

  function renderScan() {
    return `${heading("QR-ИДЕНТИФИКАЦИЯ", "Сканирование QR", "Наведите камеру на код сотрудника. В QR передаётся только EMP-ID.")}
      <section class="panel"><div class="controls"><button id="camera-start" class="button" type="button">Включить камеру</button><button id="camera-stop" class="button secondary" type="button" disabled>Выключить</button></div>
        <div id="camera-reader" aria-label="Окно камеры"></div><p id="camera-message" class="muted" role="status" aria-live="polite">Камера выключена.</p>
        <div id="scan-result"></div>
      </section>`;
  }

  function renderAudit() {
    const events = [...state.auditEvents].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
    return `${heading("КОНТРОЛЬ ИСТОРИИ", "Журнал событий", "События создания и изменения не удаляются из демонстрационного журнала.")}
      <section class="panel"><div class="toolbar"><input id="audit-search" class="control" type="search" placeholder="Поиск по событию, объекту или роли"><select id="audit-type-filter" class="control"><option value="">Все события</option>${[...new Set(events.map((item) => item.type))].map((type) => `<option value="${escapeHtml(type)}">${escapeHtml(eventTitle({ type }))}</option>`).join("")}</select></div>
      <div class="table-wrap"><table><thead><tr><th>Дата</th><th>Событие</th><th>Объект</th><th>Пользователь</th><th>Изменения</th></tr></thead><tbody id="audit-body">${events.map(auditRow).join("")}</tbody></table></div></section>`;
  }

  function auditRow(item) {
    let details = "—";
    if (item.oldValue != null || item.newValue != null) {
      details = `<details><summary>Показать</summary><pre>${escapeHtml(JSON.stringify({ old: item.oldValue, new: item.newValue }, null, 2))}</pre></details>`;
    }
    return `<tr data-search="${escapeHtml([item.type, item.entityId, item.entityType, item.actor?.role, item.actor?.id].join(" ").toLocaleLowerCase())}" data-type="${escapeHtml(item.type)}"><td>${escapeHtml(fmtDateTime(item.occurredAt))}</td><td>${escapeHtml(eventTitle(item))}</td><td><code>${escapeHtml(item.entityType)} · ${escapeHtml(item.entityId)}</code></td><td>${escapeHtml(item.actor?.role || "SYSTEM")}<div class="muted">${escapeHtml(item.actor?.id || "")}</div></td><td>${details}</td></tr>`;
  }

  function renderApprovals() {
    if (!isAdmin() && !isManager()) return `${heading("КОНТРОЛЬ", "Согласования", "IT_ADMIN создаёт запросы; SECURITY_MANAGER рассматривает их отдельно.")}${roleNotice()}`;
    const items = [...state.approvalRequests].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return `${heading("КОНТРОЛЬ", "Согласования", isAdmin() ? "Создайте запрос для независимого рассмотрения SECURITY_MANAGER." : "Решение может принять только отдельная демонстрационная роль SECURITY_MANAGER.")}
      <section class="panel"><div class="notice">Согласования записываются в локальный журнал для презентации. Они не обеспечивают реальное разделение полномочий и не меняют ограничения направлений.</div>
      <div class="table-wrap" style="margin-top:16px"><table><thead><tr><th>Дата</th><th>Сотрудник</th><th>Запрос</th><th>Инициатор</th><th>Статус</th><th>Действия</th></tr></thead><tbody>${items.map((item) => {
        const person = employee(item.employeeId);
        const status = item.status === "pending" ? "Ожидает" : item.status === "approved" ? "Согласован" : "Отклонён";
        const actions = isManager() && item.status === "pending" ? `${button("Согласовать", `approval-decide:${item.id}:approved`, "small")}${button("Отклонить", `approval-decide:${item.id}:rejected`, "danger small")}` : "—";
        return `<tr><td>${escapeHtml(fmtDate(item.createdAt))}</td><td>${button(escapeHtml(person?.fullName || item.employeeId), `employee-open:${item.employeeId}`, "secondary small")}<div class="employee-id">${escapeHtml(item.employeeId)}</div></td><td>${escapeHtml(item.requestText)}${item.decisionComment ? `<div class="muted">Решение: ${escapeHtml(item.decisionComment)}</div>` : ""}</td><td>${escapeHtml(item.requestedBy.role)} · ${escapeHtml(item.requestedBy.id)}</td><td><span class="tag ${item.status === "approved" ? "ok" : item.status === "rejected" ? "bad" : "warn"}">${status}</span></td><td><div class="table-actions">${actions}</div></td></tr>`;
      }).join("") || `<tr><td colspan="6"><div class="empty">Запросов пока нет.</div></td></tr>`}</tbody></table></div></section>`;
  }

  function roleNotice() {
    return `<div class="notice">Сейчас выбрана роль ${escapeHtml(role().label)}. Переключите демонстрационную роль в верхней панели.</div>`;
  }

  function modal(title, body, { narrow = false } = {}) {
    const root = $("#modal-root");
    root.innerHTML = `<div class="modal-backdrop"><section class="modal ${narrow ? "narrow" : ""}" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div class="modal-head"><h2 id="modal-title">${escapeHtml(title)}</h2><button class="close-button" type="button" data-action="modal-close" aria-label="Закрыть">×</button></div>${body}</section></div>`;
    $(".close-button", root).focus();
    return root;
  }

  function closeModal() { $("#modal-root").replaceChildren(); }

  function directionChoices(companyItem, selected = []) {
    const selectedSet = new Set(selected);
    const allowed = new Set(companyItem?.allowedDirectionIds || []);
    return `<div class="checkbox-list">${state.directions.map((item) => {
      const enabled = item.active && allowed.has(item.id);
      return `<label class="checkbox-item"><input type="checkbox" name="directionIds" value="${escapeHtml(item.id)}" ${selectedSet.has(item.id) ? "checked" : ""} ${enabled ? "" : "disabled"}><span>${escapeHtml(item.name)}<small>${escapeHtml(item.id)}${enabled ? "" : " · компания не разрешает"}</small></span></label>`;
    }).join("")}</div><small class="muted">Разрешено: ${(companyItem?.allowedDirectionIds || []).map((id) => escapeHtml(direction(id)?.name || id)).join(", ") || "нет"}. Максимум ${companyItem?.maxDirections || 0}.</small>`;
  }

  function employeeForm(item = null) {
    if (!isAdmin()) return;
    const editing = Boolean(item);
    const selectedCompanyId = item?.companyId || state.companies.find((value) => value.status === "active")?.id;
    const selectedCompany = company(selectedCompanyId);
    const selectedDirections = item ? employeeDirections(item.id) : [];
    const body = `<form id="employee-form" data-id="${escapeHtml(item?.id || "")}">
      <div class="form-grid">
        <div class="field span-2"><label for="employee-name">ФИО</label><input id="employee-name" name="fullName" required minlength="3" maxlength="120" value="${escapeHtml(item?.fullName || "")}"></div>
        <div class="field"><label>Внутренний ID</label><input class="control" value="${escapeHtml(item?.id || "Назначится автоматически")}" disabled></div>
        <div class="field"><label for="employee-demo-number">Демо-номер · 12 цифр</label><input id="employee-demo-number" name="demoNumber" inputmode="numeric" pattern="[0-9]{12}" maxlength="12" value="${escapeHtml(item?.demoNumber || "")}" placeholder="Сгенерируется автоматически"></div>
        <div class="field span-2"><label for="employee-company">Компания</label><select id="employee-company" name="companyId" required>${state.companies.map((value) => `<option value="${escapeHtml(value.id)}" ${value.id === selectedCompanyId ? "selected" : ""} ${value.status !== "active" && value.id !== selectedCompanyId ? "disabled" : ""}>${escapeHtml(value.name)} · ${escapeHtml(value.id)}${value.status !== "active" ? " · неактивна" : ""}</option>`).join("")}</select></div>
        <div id="employee-directions-wrap" class="field span-2"><label>Направления работ · выберите от одного до ${selectedCompany?.maxDirections || 2}</label>${directionChoices(selectedCompany, selectedDirections)}</div>
        ${editing ? `<div class="field"><label for="employee-status">Статус сотрудника</label><select id="employee-status" name="status"><option value="active" ${item.status === "active" ? "selected" : ""}>Активен</option><option value="inactive" ${item.status === "inactive" ? "selected" : ""}>Неактивен</option></select></div>` : ""}
        <div class="field span-2"><label for="employee-comment">Комментарий</label><textarea id="employee-comment" name="comment" maxlength="500" placeholder="Необязательный комментарий"></textarea></div>
      </div>
      <div class="notice">ID создаётся автоматически и не меняется при смене компании. QR содержит только EMP-ID. Номер хранится как вымышленная строка из 12 цифр.</div>
      <div class="modal-actions"><button class="button secondary" type="button" data-action="modal-close">Отмена</button><button class="button" type="submit">${editing ? "Сохранить изменения" : "Создать профиль"}</button></div>
    </form>`;
    const root = modal(editing ? "Профиль специалиста" : "Новый специалист", body);
    const form = $("#employee-form", root);
    $("#employee-company", form).addEventListener("change", () => {
      const currentIds = $$("input[name='directionIds']:checked", form).map((box) => box.value);
      const selected = company($("#employee-company", form).value);
      const keep = currentIds.filter((id) => selected.allowedDirectionIds.includes(id));
      $("#employee-directions-wrap", form).innerHTML = `<label>Направления работ · выберите от одного до ${selected.maxDirections}</label>${directionChoices(selected, keep)}`;
    });
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      try {
        const fd = new FormData(form);
        const directionIds = $$("input[name='directionIds']:checked", form).map((box) => box.value);
        const changes = {
          fullName: fd.get("fullName"),
          demoNumber: fd.get("demoNumber") || undefined,
          companyId: fd.get("companyId"),
          directionIds,
          comment: fd.get("comment"),
          status: fd.get("status") || "active",
        };
        const actor = role();
        const timestamp = now();
        const working = core.clone(state);
        if (!editing) {
          core.createEmployee(working, changes, actor, timestamp);
        } else {
          core.updateEmployeeProfile(working, item.id, changes, actor, timestamp);
        }
        state = working;
        save();
        closeModal();
        showToast(editing ? "Профиль сохранён." : "Сотрудник добавлен.");
        if (editing) openEmployee(item.id);
        else { currentView = "employees"; render(); }
      } catch (error) { showToast(error.message, "error"); }
    });
  }

  function companyForm(item = null) {
    if (!isAdmin()) return;
    const editing = Boolean(item);
    const locked = item && Object.prototype.hasOwnProperty.call(core.DEMO_COMPANY_POLICIES, item.id);
    const name = item?.name || "";
    const directionInputs = state.directions.map((directionItem) => {
      const allowed = item?.allowedDirectionIds || ["DIR-FACE", "DIR-ACS"];
      const disabled = locked && !allowed.includes(directionItem.id);
      return `<label class="checkbox-item"><input type="checkbox" name="allowedDirectionIds" value="${escapeHtml(directionItem.id)}" ${allowed.includes(directionItem.id) ? "checked" : ""} ${disabled ? "disabled" : ""}><span>${escapeHtml(directionItem.name)}<small>${escapeHtml(directionItem.id)}</small></span></label>`;
    }).join("");
    const formBody = `<form id="company-form" data-id="${escapeHtml(item?.id || "")}"><div class="form-grid">
      <div class="field span-2"><label for="company-name">Название компании</label><input id="company-name" name="name" required minlength="2" maxlength="100" value="${escapeHtml(name)}"></div>
      ${editing ? `<div class="field"><label for="company-status">Статус</label><select id="company-status" name="status"><option value="active" ${item.status === "active" ? "selected" : ""}>Активна</option><option value="inactive" ${item.status === "inactive" ? "selected" : ""}>Неактивна</option></select></div>` : ""}
      <div class="field"><label for="company-max">Максимум направлений</label><select id="company-max" name="maxDirections">${[1, 2, 3].map((count) => `<option value="${count}" ${count === (item?.maxDirections || 2) ? "selected" : ""}>${count}</option>`).join("")}</select></div>
      <div class="field span-2"><label>Разрешённые направления</label><div class="checkbox-list">${directionInputs}</div></div>
    </div>${locked ? `<div class="notice">Для ${escapeHtml(item.name)} политика закреплена: только Face ID и СКУД, максимум два направления.</div>` : ""}<div class="modal-actions"><button class="button secondary" type="button" data-action="modal-close">Отмена</button><button class="button" type="submit">${editing ? "Сохранить" : "Добавить компанию"}</button></div></form>`;
    const root = modal(editing ? "Настройки компании" : "Новая компания", formBody, { narrow: false });
    $("#company-form", root).addEventListener("submit", (event) => {
      event.preventDefault();
      try {
        const form = event.currentTarget;
        const fd = new FormData(form);
        const selected = $$("input[name='allowedDirectionIds']:checked", form).map((box) => box.value);
        const values = { name: fd.get("name"), status: fd.get("status") || "active", allowedDirectionIds: selected, maxDirections: Number(fd.get("maxDirections")) };
        if (editing) core.updateCompany(state, item.id, values, role(), now());
        else core.createCompany(state, values, role(), now());
        save(); closeModal(); render(); showToast("Компания сохранена.");
      } catch (error) { showToast(error.message, "error"); }
    });
  }

  function directionForm() {
    if (!isAdmin()) return;
    const body = `<form id="direction-form"><div class="field"><label for="direction-name">Название направления</label><input id="direction-name" name="name" required minlength="2" maxlength="100"></div><div class="notice">Новое направление станет доступно при настройке будущих компаний. Правила CTR-001—CTR-004 останутся закреплёнными.</div><div class="modal-actions"><button class="button secondary" type="button" data-action="modal-close">Отмена</button><button class="button" type="submit">Добавить направление</button></div></form>`;
    const root = modal("Новое направление", body, { narrow: true });
    $("#direction-form", root).addEventListener("submit", (event) => {
      event.preventDefault();
      try {
        core.createDirection(state, new FormData(event.currentTarget).get("name"), role(), now());
        save(); closeModal(); render(); showToast("Направление добавлено.");
      } catch (error) { showToast(error.message, "error"); }
    });
  }

  function qrModal(item) {
    if (!item) return;
    const body = `<div class="qr-panel"><div id="qr-code" class="qr-surface"></div><strong>${escapeHtml(item.fullName)}</strong><code>${escapeHtml(item.id)}</code><span class="muted">В QR содержится только EMP-ID.</span><div class="modal-actions"><button class="button secondary" type="button" data-action="modal-close">Закрыть</button><button id="qr-download" class="button" type="button">Скачать PNG</button></div></div>`;
    const root = modal("QR-код специалиста", body, { narrow: true });
    const target = $("#qr-code", root);
    if (!window.QRCode) { target.textContent = "Не загрузился модуль QR-кода. Проверьте подключение к интернету."; return; }
    new QRCode(target, { text: item.id, width: 280, height: 280, correctLevel: QRCode.CorrectLevel.H });
    $("#qr-download", root).addEventListener("click", () => {
      const image = $("img", target);
      const canvas = $("canvas", target);
      const dataUrl = image?.src || canvas?.toDataURL("image/png");
      if (!dataUrl) { showToast("QR ещё не готов.", "error"); return; }
      const anchor = document.createElement("a");
      anchor.href = dataUrl;
      anchor.download = `${item.id}-qr.png`;
      anchor.click();
    });
  }

  function approvalForm(employeeId) {
    if (!isAdmin()) return;
    const item = employee(employeeId);
    if (!item) return;
    const body = `<form id="approval-form"><p>Сотрудник: <strong>${escapeHtml(item.fullName)} · ${escapeHtml(item.id)}</strong></p><div class="field"><label for="approval-text">Запрашиваемое специальное право</label><textarea id="approval-text" name="requestText" required minlength="5" maxlength="500" placeholder="Например: расширенный просмотр истории по этому профилю"></textarea></div><div class="notice">Запрос должен рассмотреть другой пользователь с ролью SECURITY_MANAGER. Решение не меняет разрешённые компании направления.</div><div class="modal-actions"><button class="button secondary" type="button" data-action="modal-close">Отмена</button><button class="button" type="submit">Создать запрос</button></div></form>`;
    const root = modal("Запрос специального права", body, { narrow: true });
    $("#approval-form", root).addEventListener("submit", (event) => {
      event.preventDefault();
      try {
        core.requestApproval(state, item.id, new FormData(event.currentTarget).get("requestText"), role(), now());
        save(); closeModal(); currentView = "approvals"; render(); showToast("Запрос отправлен на отдельное согласование.");
      } catch (error) { showToast(error.message, "error"); }
    });
  }

  function decideApproval(requestId, decision) {
    const root = modal(decision === "approved" ? "Согласовать запрос" : "Отклонить запрос", `<form id="approval-decision-form"><div class="field"><label for="decision-comment">Комментарий решения</label><textarea id="decision-comment" name="comment" maxlength="500"></textarea></div><div class="notice">Решение будет записано в журнал. Оно не изменяет назначения сотрудника.</div><div class="modal-actions"><button class="button secondary" type="button" data-action="modal-close">Отмена</button><button class="button ${decision === "rejected" ? "danger" : ""}" type="submit">${decision === "approved" ? "Согласовать" : "Отклонить"}</button></div></form>`, { narrow: true });
    $("#approval-decision-form", root).addEventListener("submit", (event) => {
      event.preventDefault();
      try {
        core.decideApproval(state, requestId, decision, new FormData(event.currentTarget).get("comment"), role(), now());
        save(); closeModal(); render(); showToast(decision === "approved" ? "Запрос согласован." : "Запрос отклонён.");
      } catch (error) { showToast(error.message, "error"); }
    });
  }

  function openEmployee(id) {
    const item = employee(id);
    if (!item || !allowedEmployee(item)) { showToast("Сотрудник не найден или недоступен для этой роли.", "error"); return; }
    if (currentView !== "employee-detail") previousView = currentView;
    selectedEmployeeId = id;
    currentView = "employee-detail";
    render();
    $("#main-content").focus();
  }

  function openEmployeeEdit(id) {
    const item = employee(id);
    if (item) employeeForm(item);
  }

  async function mountCameraReader() {
    if (!window.Html5Qrcode) {
      setCameraMessage("Не загрузилась библиотека сканирования. Проверьте подключение к интернету.", true);
      $("#camera-start").disabled = true;
      return;
    }
    try { camera = new Html5Qrcode("camera-reader", { formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE] }); }
    catch (error) { setCameraMessage(error.message, true); }
    $("#camera-start").addEventListener("click", startCamera);
    $("#camera-stop").addEventListener("click", stopCamera);
  }

  function setCameraMessage(text, isError = false) {
    const element = $("#camera-message");
    if (!element) return;
    element.textContent = text;
    element.classList.toggle("preview-bad", isError);
  }

  async function startCamera() {
    if (!camera || cameraRunning) return;
    const start = $("#camera-start");
    const stop = $("#camera-stop");
    start.disabled = true;
    setCameraMessage("Запрашиваю доступ к камере…");
    const config = { fps: 10, qrbox: { width: 240, height: 240 } };
    const onSuccess = async (rawText) => {
      if (!cameraRunning) return;
      setCameraMessage("QR распознан. Открываю профиль…");
      await stopCamera();
      const id = String(rawText || "").trim();
      const found = employee(id);
      if (!found) {
        $("#scan-result").innerHTML = `<div class="notice critical">Сотрудник не найден. QR содержит «${escapeHtml(id.slice(0, 100))}».</div>`;
        return;
      }
      $("#scan-result").innerHTML = `<div class="notice success">Найден профиль ${escapeHtml(found.fullName)} · ${escapeHtml(found.id)}.</div>`;
      openEmployee(found.id);
    };
    try {
      cameraRunning = true;
      cameraStarting = (async () => {
        try {
          await camera.start({ facingMode: "environment" }, config, onSuccess, () => {});
        } catch (firstError) {
          try { camera.clear(); } catch {}
          const cameras = await Html5Qrcode.getCameras();
          const selected = cameras.find((item) => /back|rear|environment|задн/i.test(item.label)) || cameras[0];
          if (!selected) throw firstError;
          await camera.start(selected.id, config, onSuccess, () => {});
        }
      })();
      await cameraStarting;
      cameraStarting = null;
      $("#camera-stop").disabled = false;
      start.disabled = true;
      setCameraMessage("Камера включена. Наведите её на QR с EMP-ID.");
    } catch (error) {
      cameraStarting = null;
      cameraRunning = false;
      start.disabled = false;
      setCameraMessage(`Не удалось запустить камеру: ${error?.message || "неизвестная ошибка"}. Проверьте разрешение браузера.`, true);
    }
  }

  async function stopCamera() {
    if (cameraStarting) { try { await cameraStarting; } catch {} cameraStarting = null; }
    if (!camera || !cameraRunning) return;
    try {
      await camera.stop();
      camera.clear();
    } catch (error) {
      setCameraMessage(error?.message || "Не удалось выключить камеру.", true);
    } finally {
      cameraRunning = false;
      const start = $("#camera-start");
      const stop = $("#camera-stop");
      if (start) start.disabled = false;
      if (stop) stop.disabled = true;
      if (currentView === "scan") setCameraMessage("Камера выключена.");
    }
  }

  function renderImportWorkspace(message = "Загрузите Excel-файл, затем сопоставьте заголовки столбцов.") {
    const workspace = $("#import-workspace");
    if (workspace) workspace.innerHTML = `<div class="empty">${escapeHtml(message)}</div>`;
  }

  function downloadImportTemplate() {
    if (!window.XLSX) { showToast("Не загрузилась библиотека Excel.", "error"); return; }
    const wb = XLSX.utils.book_new();
    const rows = [
      ["ФИО", "Компания", "Направления", "Демо-номер (12 цифр)", "EMP-ID"],
      ["Алан Мырзабеков", "К-Alarm", "Face ID", "", ""],
      ["Дана Садыкова", "CTR-001", "Face ID; СКУД", "", ""],
    ];
    const sheet = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, sheet, "Сотрудники");
    XLSX.writeFileXLSX(wb, "techpass-registry-import-template.xlsx");
  }

  async function readImportFile(file) {
    if (!window.XLSX) { showToast("Не загрузилась библиотека Excel.", "error"); return; }
    try {
      const workbook = XLSX.read(await file.arrayBuffer());
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false });
      if (rows.length < 2 || !rows[0].some((cell) => String(cell).trim())) throw new Error("В файле нужна строка заголовков и хотя бы одна строка данных.");
      workbookRows = { fileName: file.name, headers: rows[0].map((cell) => String(cell).trim()), rows: rows.slice(1).filter((row) => row.some((cell) => String(cell).trim())) };
      importPreview = null;
      renderImportMapping();
    } catch (error) { renderImportWorkspace(error.message || "Не удалось прочитать файл."); }
  }

  function guessColumn(headers, names) {
    return headers.findIndex((header) => names.some((name) => header.toLocaleLowerCase().includes(name)));
  }

  function renderImportMapping() {
    const headers = workbookRows.headers;
    const fields = [
      ["fullName", "ФИО · обязательно", ["фио", "имя", "сотрудник", "name"]],
      ["company", "Компания · обязательно", ["компан", "подряд", "company"]],
      ["directions", "Направления · обязательно", ["направ", "работ", "scope", "direction"]],
      ["demoNumber", "Демо-номер · необязательно", ["номер", "идентифик", "iin", "иин"]],
      ["employeeId", "EMP-ID · необязательно", ["emp-id", "empid", "внутренний id", "employee id"]],
      ["status", "Статус · необязательно", ["статус", "status"]],
    ];
    const selectors = fields.map(([key, label, names]) => {
      const guessed = guessColumn(headers, names);
      return `<div class="field"><label for="map-${key}">${escapeHtml(label)}</label><select id="map-${key}" data-map="${key}"><option value="-1">Не сопоставлять</option>${headers.map((header, index) => `<option value="${index}" ${index === guessed ? "selected" : ""}>${escapeHtml(header || `(столбец ${index + 1})`)}</option>`).join("")}</select></div>`;
    }).join("");
    $("#import-workspace").innerHTML = `<div class="notice success">Файл: ${escapeHtml(workbookRows.fileName)} · строк: ${workbookRows.rows.length} · заголовков: ${headers.length}</div><div class="import-mapping" style="margin-top:15px">${selectors}</div><div class="modal-actions"><button id="preview-import" class="button" type="button">Проверить и показать предпросмотр</button></div><div id="import-preview"></div>`;
  }

  function mapDirectionCell(value) {
    const tokens = String(value || "").split(/[;,|\n]+/).map((part) => part.trim().toLocaleLowerCase()).filter(Boolean);
    const results = [];
    for (const token of tokens) {
      const found = state.directions.find((item) => item.id.toLocaleLowerCase() === token || item.name.toLocaleLowerCase() === token);
      if (!found) return { error: `Неизвестное направление «${token}».` };
      if (!results.includes(found.id)) results.push(found.id);
    }
    return { directionIds: results };
  }

  function createImportPreview() {
    if (!workbookRows) return;
    const mapping = Object.fromEntries($$("[data-map]", $("#import-workspace")).map((select) => [select.dataset.map, Number(select.value)]));
    if (mapping.fullName < 0 || mapping.company < 0 || mapping.directions < 0) { showToast("Сопоставьте обязательные столбцы ФИО, Компания и Направления.", "error"); return; }
    let staging = core.clone(state);
    const results = [];
    const importedNumbers = new Set();
    const importedPeople = new Set();
    workbookRows.rows.forEach((row, rowIndex) => {
      const at = (key) => mapping[key] >= 0 ? String(row[mapping[key]] ?? "").trim() : "";
      const name = at("fullName");
      const companyValue = at("company");
      const directionValue = at("directions");
      const number = at("demoNumber");
      const inputId = at("employeeId");
      const existingId = staging.employees.find((item) => item.id.toLocaleLowerCase() === inputId.toLocaleLowerCase());
      const existingNumber = number ? staging.employees.find((item) => item.demoNumber === number) : null;
      const duplicateId = inputId && !/^EMP-\d{6}$/.test(inputId) ? "Некорректный EMP-ID." : existingId ? `Сотрудник ${existingId.id} уже есть в реестре; строка не обновляет назначения.` : inputId ? "Импортированные EMP-ID не назначаются вручную; оставьте поле пустым." : "";
      const duplicateNumber = existingNumber ? `Демо-номер уже принадлежит ${existingNumber.id}.` : importedNumbers.has(number) && number ? "Демо-номер повторяется в файле." : "";
      const companyItem = staging.companies.find((item) => item.id.toLocaleLowerCase() === companyValue.toLocaleLowerCase() || item.name.toLocaleLowerCase() === companyValue.toLocaleLowerCase());
      const directionResult = mapDirectionCell(directionValue);
      const personKey = `${name.toLocaleLowerCase()}|${companyItem?.id || companyValue.toLocaleLowerCase()}`;
      const existingPerson = companyItem && staging.employees.find((item) => item.fullName.toLocaleLowerCase() === name.toLocaleLowerCase() && item.companyId === companyItem.id);
      const status = at("status").toLocaleLowerCase();
      let error = duplicateId || duplicateNumber;
      if (existingPerson) error ||= `Профиль ${existingPerson.id} с таким ФИО уже есть в компании; строка не изменяет его.`;
      if (!name) error ||= "Не указано ФИО.";
      if (!companyItem) error ||= `Компания «${companyValue || "—"}» не найдена.`;
      if (directionResult.error) error ||= directionResult.error;
      if (companyItem && directionResult.directionIds) {
        if (directionResult.directionIds.some((id) => !companyItem.allowedDirectionIds.includes(id))) error ||= `${companyItem.name}: направление не разрешено.`;
        if (directionResult.directionIds.length > companyItem.maxDirections) error ||= `${companyItem.name}: превышен лимит направлений.`;
      }
      if (number && !/^\d{12}$/.test(number)) error ||= "Демо-номер должен содержать ровно 12 цифр.";
      if (number && importedNumbers.has(number)) error ||= "Демо-номер повторяется в файле.";
      if (importedPeople.has(personKey)) error ||= "ФИО в этой компании повторяется в файле.";
      if (status && !["inactive", "неактивен", "неактивна", "уволен", "уволена", "active", "активен", "активна", "работает"].includes(status)) error ||= `Неизвестный статус «${at("status") }».`;
      if (error) { results.push({ row: rowIndex + 2, status: "error", name, error }); return; }
      if (number) importedNumbers.add(number);
      importedPeople.add(personKey);
      try {
        const created = core.createEmployee(staging, { fullName: name, companyId: companyItem.id, directionIds: directionResult.directionIds, demoNumber: number || undefined }, role(), now());
        if (["inactive", "неактивен", "неактивна", "уволен", "уволена"].includes(status)) core.setEmployeeStatus(staging, created.id, "inactive", [], role(), now());
        results.push({ row: rowIndex + 2, status: "valid", name, id: created.id, demoNumber: created.demoNumber });
      } catch (cause) {
        results.push({ row: rowIndex + 2, status: "error", name, error: cause.message });
      }
    });
    importPreview = { staging, results, baseState: JSON.stringify(state), fileName: workbookRows.fileName };
    const validCount = results.filter((item) => item.status === "valid").length;
    const errorCount = results.length - validCount;
    $("#import-preview").innerHTML = `<section class="panel" style="margin-top:16px"><div class="panel-heading"><div><h2>Предварительный просмотр</h2><p>Готово к добавлению: ${validCount} · ошибок или дублей: ${errorCount}</p></div>${validCount ? `<button id="confirm-import" class="button" type="button">Подтвердить импорт (${validCount})</button>` : ""}</div><div class="table-wrap"><table><thead><tr><th>Строка</th><th>Сотрудник</th><th>Результат</th><th>EMP-ID / ошибка</th><th>Демо-номер</th></tr></thead><tbody>${results.map((item) => `<tr><td>${item.row}</td><td>${escapeHtml(item.name || "—")}</td><td class="${item.status === "valid" ? "preview-good" : "preview-bad"}">${item.status === "valid" ? "Будет добавлен" : "Не импортируется"}</td><td>${escapeHtml(item.status === "valid" ? item.id : item.error)}</td><td>${escapeHtml(item.demoNumber || "—")}</td></tr>`).join("")}</tbody></table></div><p class="muted" style="margin-top:12px">Существующие профили не изменяются. Если данные реестра изменились после предпросмотра, потребуется повторная проверка.</p></section>`;
  }

  function confirmImport() {
    if (!importPreview) return;
    if (JSON.stringify(state) !== importPreview.baseState) { showToast("Реестр изменился после предпросмотра. Проверьте файл заново.", "error"); importPreview = null; createImportPreview(); return; }
    const imported = importPreview.results.filter((item) => item.status === "valid").length;
    if (!imported) return;
    state = importPreview.staging;
    const actor = role();
    const eventId = `EVT-${String(Math.max(0, ...state.auditEvents.map((item) => { const parts = item.id.split("-"); return Number(parts[parts.length - 1]) || 0; })) + 1).padStart(6, "0")}`;
    state.auditEvents.push({ id: eventId, occurredAt: now(), actor: { id: actor.id, role: actor.role }, type: "import.completed", entityType: "import", entityId: eventId, oldValue: null, newValue: { fileName: importPreview.fileName, inserted: imported, rejected: importPreview.results.length - imported } });
    save(); importPreview = null; workbookRows = null; currentView = "employees"; render(); showToast(`Импорт завершён: добавлено ${imported}.`);
  }

  function renderFilters() {
    const companyFilter = $("#company-filter");
    const statusFilter = $("#status-filter");
    if (!companyFilter) return;
    const companyId = companyFilter.value;
    const status = statusFilter.value;
    const query = $("#employee-search").value;
    const filtered = core.searchEmployees(state, query).filter(allowedEmployee).filter((item) => (!companyId || item.companyId === companyId) && (!status || item.status === status));
    $("#employee-table-body").innerHTML = filtered.map(employeeRow).join("") || `<tr><td colspan="6"><div class="empty">По этому запросу ничего не найдено.</div></td></tr>`;
  }

  function filterAssignments() {
    const companyId = $("#assignment-company-filter")?.value || "";
    const status = $("#assignment-status-filter")?.value || "";
    $$("#assignments-body tr").forEach((row) => {
      row.classList.toggle("hidden", (companyId && row.dataset.company !== companyId) || (status && row.dataset.status !== status));
    });
  }

  function filterAudit() {
    const query = $("#audit-search")?.value.toLocaleLowerCase() || "";
    const type = $("#audit-type-filter")?.value || "";
    $$("#audit-body tr").forEach((row) => {
      row.classList.toggle("hidden", (query && !row.dataset.search.includes(query)) || (type && row.dataset.type !== type));
    });
  }

  function handleClick(event) {
    const target = event.target.closest("[data-action]");
    if (!target) return;
    const [action, ...parts] = target.dataset.action.split(":");
    if (action === "modal-close") { closeModal(); return; }
    if (action === "navigate-companies") { setView("companies"); return; }
    if (action === "navigate-audit") { setView("audit"); return; }
    if (action === "employee-create") { employeeForm(); return; }
    if (action === "company-create") { companyForm(); return; }
    if (action === "direction-create") { directionForm(); return; }
    if (action === "import-template") { downloadImportTemplate(); return; }
    if (action === "employee-open") { openEmployee(parts[0]); return; }
    if (action === "employee-edit") { openEmployeeEdit(parts[0]); return; }
    if (action === "employee-qr") { qrModal(employee(parts[0])); return; }
    if (action === "approval-create") { approvalForm(parts[0]); return; }
    if (action === "approval-decide") { decideApproval(parts[0], parts[1]); return; }
    if (action === "company-edit") { companyForm(company(parts[0])); return; }
    if (action === "employee-back") { currentView = previousView || "employees"; selectedEmployeeId = null; render(); return; }
  }

  function handleNavigation(event) {
    const button = event.target.closest("[data-view]");
    if (!button) return;
    setView(button.dataset.view);
  }

  document.addEventListener("click", handleClick);
  $("#sidebar").addEventListener("click", handleNavigation);
  $("#menu-toggle").addEventListener("click", () => $("#sidebar").classList.toggle("open"));
  $("#role-select").addEventListener("change", async () => {
    if (currentView === "scan") await stopCamera();
    state.preferences ||= {};
    state.preferences.role = $("#role-select").value;
    save();
    if (currentView === "employee-detail" && !allowedEmployee(employee(selectedEmployeeId))) currentView = "employees";
    render();
  });
  $("#main-content").addEventListener("input", (event) => {
    if (event.target.id === "employee-search") renderFilters();
    if (event.target.id === "audit-search") filterAudit();
  });
  $("#main-content").addEventListener("change", async (event) => {
    if (event.target.id === "company-filter" || event.target.id === "status-filter") renderFilters();
    if (event.target.id === "assignment-company-filter" || event.target.id === "assignment-status-filter") filterAssignments();
    if (event.target.id === "audit-type-filter") filterAudit();
    if (event.target.id === "import-file") await readImportFile(event.target.files?.[0]);
  });
  $("#main-content").addEventListener("click", (event) => {
    if (event.target.id === "preview-import") createImportPreview();
    if (event.target.id === "confirm-import") confirmImport();
  });
  window.addEventListener("storage", async (event) => {
    if (event.key !== STORAGE_KEY || !event.newValue) return;
    if (currentView === "scan") await stopCamera();
    try { state = JSON.parse(event.newValue); render(); showToast("Данные обновились в другой вкладке."); } catch {}
  });
  window.addEventListener("beforeunload", () => { if (cameraRunning) stopCamera(); });

  initialize().catch((error) => {
    $("#main-content").innerHTML = `<section class="panel"><h1>Не удалось открыть реестр</h1><p class="notice critical">${escapeHtml(error.message || error)}</p><p class="muted">Проверьте подключение к интернету и обновите страницу.</p></section>`;
  });
})();
