/*
 * CONFIGURAÇÃO SUPABASE
 * Cole os valores do projeto em Supabase > Project Settings > API:
 * - URL: Project URL
 * - chave pública: Publishable (sb_publishable_...) ou anon/anon public legado
 * Nunca use uma chave Secret ou service_role no navegador.
 * Enquanto estes valores forem placeholders, a página pública usa dados de demonstração.
 */
const SUPABASE_URL = 'https://liaxvcefxkpesjvqqeth.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_Eba2Lq7576TtAHVtMbCU9w_ewC6Z4Ab';

const TABLES = {
  acolytes: 'acolitos',
  exceptions: 'missas_editadas',
  assignments: 'missas_funcoes',
  admins: 'admin_users'
};

const GENERAL_LITURGICAL_ROLES = [
  'Cerimoniário',
  'Turiferário',
  'Naveteiro',
  'Cruciferário',
  '1º Ceroferário (Tocha)',
  '2º Ceroferário (Tocha)',
  'Librífero (Missal)',
  'Acólito de Credência/Altar'
];

const SECOND_SATURDAY_ROLES = ['Turíbulo', 'Naveta', 'Microfone'];
const FOURTH_SATURDAY_ROLES = ['Microfone', 'Missal'];

const DEMO_ACOLYTES = [
  { id: 'demo-1', nome: 'Ana Clara', ativo: true },
  { id: 'demo-2', nome: 'João Pedro', ativo: true },
  { id: 'demo-3', nome: 'Maria Eduarda', ativo: true },
  { id: 'demo-4', nome: 'Lucas', ativo: true },
  { id: 'demo-5', nome: 'Beatriz', ativo: true },
  { id: 'demo-6', nome: 'Gabriel', ativo: true },
  { id: 'demo-7', nome: 'Sofia', ativo: true },
  { id: 'demo-8', nome: 'Rafael', ativo: true }
];

const hasSupabaseCredentials =
  SUPABASE_URL.startsWith('https://') &&
  !SUPABASE_URL.includes('YOUR-PROJECT') &&
  SUPABASE_ANON_KEY !== 'YOUR_SUPABASE_ANON_KEY';

const supabaseClient = hasSupabaseCredentials && window.supabase
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

function localDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getSaturdayOccurrence(dateKey) {
  if (!dateKey) return 0;
  const [year, month, day] = dateKey.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.getDay() === 6 ? Math.floor((day - 1) / 7) + 1 : 0;
}

function getRolesForMass(mass) {
  const originalDate = mass.origem === 'automatica'
    ? mass.data_original || mass.data_missa
    : mass.data_missa;
  const occurrence = getSaturdayOccurrence(originalDate);

  if (mass.origem === 'automatica') {
    if (occurrence === 2) return SECOND_SATURDAY_ROLES;
    if (occurrence === 4) return FOURTH_SATURDAY_ROLES;
  } else {
    const time = String(mass.horario || '').slice(0, 5);
    if (occurrence === 2 && time === '18:00') return SECOND_SATURDAY_ROLES;
    if (occurrence === 4 && time === '17:00') return FOURTH_SATURDAY_ROLES;
  }
  return GENERAL_LITURGICAL_ROLES;
}

function addMonthsClamped(date, monthCount) {
  const absoluteMonth = date.getFullYear() * 12 + date.getMonth() + monthCount;
  const year = Math.floor(absoluteMonth / 12);
  const month = absoluteMonth % 12;
  const finalDay = new Date(year, month + 1, 0).getDate();
  return new Date(year, month, Math.min(date.getDate(), finalDay));
}

function getRollingPeriod(now = new Date()) {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = addMonthsClamped(start, 12);
  return {
    start,
    end,
    startKey: localDateKey(start),
    endKey: localDateKey(end)
  };
}

function getMassesForNext12Months(now = new Date()) {
  const period = getRollingPeriod(now);
  const masses = [];
  const monthCursor = new Date(period.start.getFullYear(), period.start.getMonth(), 1);

  while (monthCursor < period.end) {
    let saturdayCount = 0;
    const daysInMonth = new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 0).getDate();
    for (let day = 1; day <= daysInMonth; day += 1) {
      const date = new Date(monthCursor.getFullYear(), monthCursor.getMonth(), day);
      if (date.getDay() !== 6) continue;
      saturdayCount += 1;
      if (saturdayCount !== 2 && saturdayCount !== 4) continue;

      const dateKey = localDateKey(date);
      if (dateKey < period.startKey || dateKey >= period.endKey) continue;
      masses.push({
        chave_missa: `auto:${dateKey}`,
        data_original: dateKey,
        data_missa: dateKey,
        horario: saturdayCount === 2 ? '18:00:00' : '17:00:00',
        titulo: 'Missa',
        tipo: 'automatica',
        cancelada: false,
        origem: 'automatica'
      });
    }
    monthCursor.setMonth(monthCursor.getMonth() + 1);
  }
  return masses;
}

function isInRollingPeriod(dateKey, period) {
  return Boolean(dateKey && dateKey >= period.startKey && dateKey < period.endKey);
}

function mergeMassOverrides(automaticMasses, overrides, now = new Date(), includeCancelled = false) {
  const period = getRollingPeriod(now);
  const massesByKey = new Map(automaticMasses.map((mass) => [mass.chave_missa, { ...mass }]));

  (overrides || []).forEach((edit) => {
    if (edit.tipo === 'alteracao') {
      massesByKey.delete(edit.chave_missa);
      if (edit.cancelada && !includeCancelled) return;
      if (isInRollingPeriod(edit.data_missa, period)) {
        massesByKey.set(edit.chave_missa, {
          chave_missa: edit.chave_missa,
          data_original: edit.data_original,
          data_missa: edit.data_missa,
          horario: edit.horario,
          titulo: edit.titulo || 'Missa',
          tipo: 'automatica',
          cancelada: Boolean(edit.cancelada),
          origem: 'automatica',
          editada: true
        });
      }
      return;
    }

    if (edit.tipo === 'extra' && (includeCancelled || !edit.cancelada) &&
      isInRollingPeriod(edit.data_missa, period)) {
      massesByKey.set(edit.chave_missa, {
        chave_missa: edit.chave_missa,
        data_original: null,
        data_missa: edit.data_missa,
        horario: edit.horario,
        titulo: edit.titulo || 'Missa especial',
        tipo: 'extra',
        cancelada: Boolean(edit.cancelada),
        origem: 'extra',
        editada: true
      });
    }
  });

  return [...massesByKey.values()].sort((a, b) =>
    a.data_missa.localeCompare(b.data_missa) ||
    a.horario.localeCompare(b.horario) ||
    a.titulo.localeCompare(b.titulo, 'pt-BR'));
}

function makeAssignments(masses, acolytes, savedAssignments = []) {
  const activeAcolytes = acolytes.filter((acolyte) => acolyte.ativo);
  const acolyteById = new Map(activeAcolytes.map((acolyte) => [acolyte.id, acolyte]));
  const savedByKeyAndRole = new Map(
    savedAssignments.map((assignment) => [
      `${assignment.chave_missa}|${assignment.funcao}`,
      assignment
    ])
  );
  const serviceCount = new Map(activeAcolytes.map((acolyte) => [acolyte.id, 0]));
  const roleCount = new Map();
  const lastRoleMass = new Map();
  const pairCount = new Map();
  let previousTeam = new Set();
  const generated = [];

  masses.filter((mass) => !mass.cancelada).forEach((mass, massIndex) => {
    const roles = getRolesForMass(mass);
    const assigned = new Set();
    const team = new Set();
    const currentAssignments = new Map();

    roles.forEach((role) => {
      const existing = savedByKeyAndRole.get(`${mass.chave_missa}|${role}`);
      if (!existing || !existing.manual) return;
      currentAssignments.set(role, existing.acolito_id || null);
      if (existing.acolito_id) {
        assigned.add(existing.acolito_id);
        if (acolyteById.has(existing.acolito_id)) team.add(existing.acolito_id);
      }
    });

    roles.forEach((role, roleIndex) => {
      const existing = savedByKeyAndRole.get(`${mass.chave_missa}|${role}`);
      if (existing && existing.manual) return;

      const candidates = activeAcolytes
        .filter((acolyte) => !assigned.has(acolyte.id))
        .sort((a, b) => {
          const aRoleCount = roleCount.get(`${a.id}|${role}`) || 0;
          const bRoleCount = roleCount.get(`${b.id}|${role}`) || 0;
          const aRepeatedRole = lastRoleMass.get(a.id) === role ? 1 : 0;
          const bRepeatedRole = lastRoleMass.get(b.id) === role ? 1 : 0;
          const pairScore = (candidate, existingTeam) => {
            let score = 0;
            existingTeam.forEach((memberId) => {
              const pair = [candidate, memberId].sort().join('|');
              score += (pairCount.get(pair) || 0) * 4;
            });
            return score;
          };
          const aScore = aRoleCount * 20 + aRepeatedRole * 80 +
            serviceCount.get(a.id) * 60 + (previousTeam.has(a.id) ? 30 : 0) +
            pairScore(a.id, team);
          const bScore = bRoleCount * 20 + bRepeatedRole * 80 +
            serviceCount.get(b.id) * 60 + (previousTeam.has(b.id) ? 30 : 0) +
            pairScore(b.id, team);
          if (aScore !== bScore) return aScore - bScore;
          const aIndex = (activeAcolytes.indexOf(a) - massIndex - roleIndex + activeAcolytes.length) % activeAcolytes.length;
          const bIndex = (activeAcolytes.indexOf(b) - massIndex - roleIndex + activeAcolytes.length) % activeAcolytes.length;
          return aIndex - bIndex || a.nome.localeCompare(b.nome, 'pt-BR');
        });

      const selected = candidates[0] || null;
      const acolyteId = selected ? selected.id : null;
      currentAssignments.set(role, acolyteId);
      generated.push({
        chave_missa: mass.chave_missa,
        funcao: role,
        acolito_id: acolyteId,
        manual: false
      });
      if (selected) {
        assigned.add(selected.id);
        team.add(selected.id);
      }
    });

    currentAssignments.forEach((acolyteId, role) => {
      if (!acolyteId || !acolyteById.has(acolyteId)) return;
      serviceCount.set(acolyteId, serviceCount.get(acolyteId) + 1);
      roleCount.set(`${acolyteId}|${role}`, (roleCount.get(`${acolyteId}|${role}`) || 0) + 1);
      lastRoleMass.set(acolyteId, role);
    });

    const teamMembers = [...team];
    for (let i = 0; i < teamMembers.length; i += 1) {
      for (let j = i + 1; j < teamMembers.length; j += 1) {
        const pair = [teamMembers[i], teamMembers[j]].sort().join('|');
        pairCount.set(pair, (pairCount.get(pair) || 0) + 1);
      }
    }
    previousTeam = team;
  });

  return generated;
}

function formatMassDate(dateKey, options = {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric'
}) {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Intl.DateTimeFormat('pt-BR', options).format(new Date(year, month - 1, day, 12));
}

function formatMassTime(time) {
  return String(time || '').slice(0, 5);
}

function setNotice(element, message, kind = '') {
  if (!element) return;
  element.textContent = message;
  element.className = `notice${kind ? ` ${kind}` : ''}`;
  element.hidden = !message;
}

function showConfigurationNotice(element) {
  const message = hasSupabaseCredentials
    ? 'Login indisponível: a biblioteca do Supabase não carregou. Verifique sua conexão e o script CDN.'
    : 'Login indisponível: configure SUPABASE_URL e SUPABASE_ANON_KEY no início de app.js.';
  setNotice(element, message, 'info');
}

function renderDemoPublicMasses(masses, period, message) {
  const demoAssignments = makeAssignments(masses, DEMO_ACOLYTES, []);
  renderPublicMasses(masses, demoAssignments, DEMO_ACOLYTES, period);
  setNotice(document.getElementById('publicStatus'), message, 'info');
}

function groupAssignmentsByMass(assignments) {
  const grouped = new Map();
  assignments.forEach((assignment) => {
    if (!grouped.has(assignment.chave_missa)) grouped.set(assignment.chave_missa, []);
    grouped.get(assignment.chave_missa).push(assignment);
  });
  return grouped;
}

function makeTeamList(mass, assignments, namesById) {
  const roles = getRolesForMass(mass);
  if (!assignments || !assignments.some((assignment) => roles.includes(assignment.funcao))) {
    const empty = document.createElement('p');
    empty.className = 'empty-team';
    empty.textContent = 'Escala ainda não gerada.';
    return empty;
  }
  const list = document.createElement('ul');
  list.className = 'team-list';
  roles.forEach((role) => {
    const assignment = assignments.find((item) => item.funcao === role);
    const item = document.createElement('li');
    item.className = 'team-badge';
    const functionName = document.createElement('strong');
    functionName.className = 'role-label';
    functionName.textContent = `${role}: `;
    const name = assignment && assignment.acolito_id
      ? namesById.get(assignment.acolito_id) || 'Acólito indisponível'
      : 'A definir';
    const person = document.createElement('span');
    person.className = 'team-person';
    person.textContent = name;
    item.append(functionName, person);
    if (!assignment || !assignment.acolito_id) item.classList.add('vacant-role');
    list.append(item);
  });
  return list;
}

function renderPublicMasses(masses, assignments, acolytes, period) {
  const nextMass = document.getElementById('nextMass');
  const massList = document.getElementById('massList');
  const schedulePeriod = document.getElementById('schedulePeriod');
  const namesById = new Map(acolytes.map((acolyte) => [acolyte.id, acolyte.nome]));
  const assignmentsByMass = groupAssignmentsByMass(assignments);
  const upcoming = masses.filter((mass) => !mass.cancelada);
  const next = upcoming[0];
  if (schedulePeriod) {
    schedulePeriod.textContent = `${formatMassDate(period.startKey, { day: 'numeric', month: 'short' })} – ${formatMassDate(period.endKey, { day: 'numeric', month: 'short', year: 'numeric' })}`;
  }

  if (!next) {
    nextMass.replaceChildren();
    const message = document.createElement('p');
    message.className = 'empty-state';
    message.textContent = 'Não há próximas missas neste período.';
    nextMass.append(message);
  } else {
    const layout = document.createElement('div');
    layout.className = 'featured-layout';
    const dateBlock = document.createElement('div');
    dateBlock.className = 'date-block';
    const title = document.createElement('span');
    title.className = 'eyebrow';
    title.textContent = next.titulo;
    const date = document.createElement('span');
    date.className = 'date-day';
    date.textContent = formatMassDate(next.data_missa);
    const time = document.createElement('span');
    time.className = 'date-time';
    time.textContent = `Às ${formatMassTime(next.horario)}`;
    dateBlock.append(title, date, time);
    layout.append(dateBlock, makeTeamList(next, assignmentsByMass.get(next.chave_missa), namesById));
    nextMass.replaceChildren(layout);
  }

  massList.replaceChildren();
  if (!upcoming.length) {
    const message = document.createElement('p');
    message.className = 'empty-state';
    message.textContent = 'Não há próximas missas neste período.';
    massList.append(message);
    return;
  }
  upcoming.forEach((mass) => {
    const card = document.createElement('article');
    card.className = 'mass-card';
    const date = document.createElement('div');
    date.className = 'mass-date';
    const title = document.createElement('strong');
    title.textContent = mass.titulo;
    const dateText = document.createElement('span');
    dateText.textContent = formatMassDate(mass.data_missa);
    const time = document.createElement('span');
    time.textContent = `Às ${formatMassTime(mass.horario)}`;
    date.append(title, dateText, time);
    card.append(date, makeTeamList(mass, assignmentsByMass.get(mass.chave_missa), namesById));
    massList.append(card);
  });
}

async function fetchAssignments(masses) {
  const keys = masses.map((mass) => mass.chave_missa);
  if (!keys.length) return [];
  const { data, error } = await supabaseClient.from(TABLES.assignments)
    .select('chave_missa,funcao,acolito_id,manual')
    .in('chave_missa', keys);
  if (error) throw error;
  return data || [];
}

let publicLoadVersion = 0;

async function loadPublicPage() {
  const loadVersion = ++publicLoadVersion;
  const status = document.getElementById('publicStatus');
  const period = getRollingPeriod();
  const automatic = getMassesForNext12Months();
  if (!supabaseClient) {
    const masses = mergeMassOverrides(automatic, [], new Date());
    renderDemoPublicMasses(masses, period, hasSupabaseCredentials
      ? 'Modo demonstração: não foi possível inicializar o Supabase. Os dados exibidos não são salvos.'
      : 'Modo demonstração: configure as chaves do Supabase para usar os dados reais. Estes acólitos e escalas são fictícios.');
    return;
  }

  try {
    const [acolytesResponse, exceptionsResponse] = await Promise.all([
      supabaseClient.from(TABLES.acolytes).select('id,nome,ativo').eq('ativo', true).order('nome'),
      supabaseClient.from(TABLES.exceptions).select('chave_missa,data_original,data_missa,horario,titulo,tipo,cancelada')
    ]);
    if (acolytesResponse.error) throw acolytesResponse.error;
    if (exceptionsResponse.error) throw exceptionsResponse.error;
    const masses = mergeMassOverrides(automatic, exceptionsResponse.data || [], new Date());
    const acolytes = acolytesResponse.data || [];
    if (!acolytes.length) {
      if (loadVersion !== publicLoadVersion) return;
      renderDemoPublicMasses(masses, period, 'Modo demonstração: ainda não há acólitos ativos no banco. A equipe exibida é fictícia; cadastre os acólitos no painel para publicar a escala real.');
      return;
    }
    const assignments = await fetchAssignments(masses);
    if (loadVersion !== publicLoadVersion) return;
    renderPublicMasses(masses, assignments, acolytes, period);
    setNotice(status, '');
  } catch (error) {
    if (loadVersion !== publicLoadVersion) return;
    const masses = mergeMassOverrides(automatic, [], new Date());
    renderPublicMasses(masses, [], [], period);
    setNotice(status, `Não foi possível carregar a escala do Supabase: ${error.message}`, 'error');
  }
}

function subscribeToPublicChanges() {
  if (!supabaseClient) return;
  let refreshTimer;
  const scheduleRefresh = () => {
    window.clearTimeout(refreshTimer);
    refreshTimer = window.setTimeout(loadPublicPage, 200);
  };
  const channel = supabaseClient.channel('public-mass-schedule');
  [TABLES.acolytes, TABLES.exceptions, TABLES.assignments].forEach((table) => {
    channel.on('postgres_changes', { event: '*', schema: 'public', table }, scheduleRefresh);
  });
  channel.subscribe((status) => {
    if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
      setNotice(document.getElementById('publicStatus'), 'A atualização em tempo real não está disponível. Recarregue a página para buscar alterações recentes.', 'info');
    }
  });
}

async function isAdministrator(user) {
  const { data, error } = await supabaseClient
    .from(TABLES.admins)
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

function renderAcolytes(acolytes) {
  const list = document.getElementById('acolyteList');
  list.replaceChildren();
  if (!acolytes.length) {
    const empty = document.createElement('li');
    empty.className = 'empty-state';
    empty.textContent = 'Nenhum acólito ativo cadastrado.';
    list.append(empty);
    return;
  }
  acolytes.forEach((acolyte) => {
    const item = document.createElement('li');
    item.className = 'acolyte-item';
    const name = document.createElement('span');
    name.textContent = acolyte.nome;
    item.append(name);
    list.append(item);
  });
}

let adminAcolytes = [];
let adminMasses = [];
let adminAssignments = [];
let adminLoadVersion = 0;

async function loadAdminSchedule() {
  const loadVersion = ++adminLoadVersion;
  const period = getRollingPeriod();
  const [exceptionsResponse, acolytesResponse] = await Promise.all([
    supabaseClient.from(TABLES.exceptions)
      .select('chave_missa,data_original,data_missa,horario,titulo,tipo,cancelada'),
    supabaseClient.from(TABLES.acolytes).select('id,nome,ativo').eq('ativo', true).order('nome')
  ]);
  if (exceptionsResponse.error) throw exceptionsResponse.error;
  if (acolytesResponse.error) throw acolytesResponse.error;

  const exceptions = exceptionsResponse.data || [];
  const acolytes = acolytesResponse.data || [];
  const masses = mergeMassOverrides(getMassesForNext12Months(), exceptions, new Date(), true)
    .filter((mass) => !mass.cancelada);
  const assignments = await fetchAssignments(masses);
  if (loadVersion !== adminLoadVersion) return;
  adminAcolytes = acolytes;
  adminMasses = masses;
  adminAssignments = assignments;
  renderAcolytes(adminAcolytes);
  renderAdminSchedule();
  const periodElement = document.getElementById('adminPeriod');
  if (periodElement) {
    periodElement.textContent = `${formatMassDate(period.startKey, { day: 'numeric', month: 'short' })} – ${formatMassDate(period.endKey, { day: 'numeric', month: 'short', year: 'numeric' })}`;
  }
}

function renderAdminSchedule() {
  const list = document.getElementById('adminScheduleList');
  list.replaceChildren();
  if (!adminMasses.length) {
    const empty = document.createElement('p');
    empty.className = 'empty-state';
    empty.textContent = 'Não há missas previstas nos próximos 12 meses.';
    list.append(empty);
    return;
  }

  adminMasses.forEach((mass) => {
    const card = document.createElement('section');
    card.className = 'admin-mass-card';
    const header = document.createElement('div');
    header.className = 'admin-mass-header';
    const heading = document.createElement('strong');
    heading.textContent = mass.titulo;
    const summary = document.createElement('span');
    summary.textContent = `${formatMassDate(mass.data_missa)} às ${formatMassTime(mass.horario)}`;
    header.append(heading, summary);
    card.append(header);

    getRolesForMass(mass).forEach((role) => card.append(renderAssignmentRow(mass, role)));
    list.append(card);
  });
}

function renderAssignmentRow(mass, role) {
  const row = document.createElement('div');
  row.className = 'admin-assignment';
  const roleLabel = document.createElement('strong');
  roleLabel.textContent = role;
  const form = document.createElement('form');
  form.className = 'assignment-control';
  const select = document.createElement('select');
  select.setAttribute('aria-label', `${role} em ${formatMassDate(mass.data_missa)}`);
  const vacant = document.createElement('option');
  vacant.value = '';
  vacant.textContent = 'Vaga / não atribuído';
  select.append(vacant);
  const current = adminAssignments.find((assignment) =>
    assignment.chave_missa === mass.chave_missa && assignment.funcao === role);
  const assignedElsewhere = new Set(adminAssignments
    .filter((assignment) => assignment.chave_missa === mass.chave_missa &&
      assignment.funcao !== role && assignment.acolito_id)
    .map((assignment) => assignment.acolito_id));
  adminAcolytes.forEach((acolyte) => {
    if (assignedElsewhere.has(acolyte.id) && acolyte.id !== (current && current.acolito_id)) return;
    const option = document.createElement('option');
    option.value = acolyte.id;
    option.textContent = acolyte.nome;
    select.append(option);
  });
  select.value = current && current.acolito_id ? current.acolito_id : '';
  const save = document.createElement('button');
  save.type = 'submit';
  save.className = 'button button-outline button-small';
  save.textContent = 'Salvar função';
  form.append(select, save);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    saveAssignment(mass, role, select.value || null);
  });
  row.append(roleLabel, form);
  return row;
}

async function saveAssignment(mass, role, acolyteId) {
  const status = document.getElementById('adminStatus');
  const duplicate = acolyteId && adminAssignments.some((assignment) =>
    assignment.chave_missa === mass.chave_missa &&
    assignment.funcao !== role &&
    assignment.acolito_id === acolyteId);
  if (duplicate) {
    setNotice(status, 'Um acólito não pode ocupar duas funções na mesma missa.', 'error');
    return;
  }
  const { error } = await supabaseClient.from(TABLES.assignments).upsert({
    chave_missa: mass.chave_missa,
    funcao: role,
    acolito_id: acolyteId,
    manual: true
  }, { onConflict: 'chave_missa,funcao' });
  if (error) {
    setNotice(status, `Não foi possível salvar a função: ${error.message}`, 'error');
    return;
  }
  try {
    await loadAdminSchedule();
    setNotice(status, 'Função manual salva e publicada.', 'success');
  } catch (loadError) {
    setNotice(status, `Função salva, mas houve erro ao atualizar a tela: ${loadError.message}`, 'error');
  }
}

async function generateRollingSchedule() {
  const status = document.getElementById('adminStatus');
  try {
    const masses = adminMasses.filter((mass) => !mass.cancelada);
    if (!masses.length) {
      setNotice(status, 'Não há missas neste período para gerar.', 'info');
      return;
    }
    const generated = makeAssignments(masses, adminAcolytes, adminAssignments);
    const { error } = await supabaseClient.rpc('regenerar_funcoes_geradas', {
      p_chaves: masses.map((mass) => mass.chave_missa),
      p_funcoes: generated
    });
    if (error) throw error;
    await loadAdminSchedule();
    setNotice(status, `Rodízio atualizado para ${masses.length} missas. Ajustes manuais foram preservados.`, 'success');
  } catch (error) {
    setNotice(status, `Não foi possível gerar o rodízio: ${error.message}`, 'error');
  }
}

async function initializeAdminPage() {
  const status = document.getElementById('adminStatus');
  const content = document.getElementById('adminContent');
  const logoutButton = document.getElementById('logoutButton');
  if (!supabaseClient) {
    setNotice(status, 'Configure a URL e a chave anon do Supabase no início de app.js para habilitar o painel.', 'info');
    return;
  }

  try {
    const { data: { session }, error } = await supabaseClient.auth.getSession();
    if (error) throw error;
    if (!session) {
      window.location.replace('login.html');
      return;
    }
    if (!(await isAdministrator(session.user))) {
      const { error: signOutError } = await supabaseClient.auth.signOut();
      if (signOutError) throw signOutError;
      setNotice(status, 'Esta conta não está autorizada a acessar o painel.', 'error');
      return;
    }

    logoutButton.hidden = false;
    content.hidden = false;
    await loadAdminSchedule();
    setNotice(status, 'Acesso autorizado.', 'success');
  } catch (error) {
    setNotice(status, `Não foi possível abrir o painel: ${error.message}`, 'error');
    return;
  }

  logoutButton.addEventListener('click', async () => {
    const { error } = await supabaseClient.auth.signOut();
    if (error) {
      setNotice(status, `Não foi possível sair: ${error.message}`, 'error');
      return;
    }
    window.location.replace('login.html');
  });

  document.getElementById('acolyteForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const input = document.getElementById('acolyteName');
    const nome = input.value.trim();
    if (!nome) return;
    const { error } = await supabaseClient.from(TABLES.acolytes).insert({ nome, ativo: true });
    if (error) {
      setNotice(status, `Não foi possível cadastrar o acólito: ${error.message}`, 'error');
      return;
    }
    input.value = '';
    try {
      await loadAdminSchedule();
      setNotice(status, 'Acólito cadastrado.', 'success');
    } catch (loadError) {
      setNotice(status, `Acólito cadastrado, mas houve erro ao atualizar a lista: ${loadError.message}`, 'error');
    }
  });

  document.getElementById('generateButton').addEventListener('click', generateRollingSchedule);
  subscribeToAdminChanges();
}

function subscribeToAdminChanges() {
  let refreshTimer;
  const scheduleRefresh = () => {
    window.clearTimeout(refreshTimer);
    refreshTimer = window.setTimeout(async () => {
      try {
        await loadAdminSchedule();
      } catch (error) {
        setNotice(document.getElementById('adminStatus'), `Não foi possível atualizar os dados: ${error.message}`, 'error');
      }
    }, 200);
  };
  const channel = supabaseClient.channel('admin-mass-schedule');
  [TABLES.acolytes, TABLES.exceptions, TABLES.assignments].forEach((table) => {
    channel.on('postgres_changes', { event: '*', schema: 'public', table }, scheduleRefresh);
  });
  channel.subscribe((status) => {
    if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
      setNotice(document.getElementById('adminStatus'), 'A atualização em tempo real não está disponível; recarregue para buscar alterações recentes.', 'info');
    }
  });
}

async function initializeLoginPage() {
  const form = document.getElementById('loginForm');
  const status = document.getElementById('loginStatus');
  if (!supabaseClient) {
    showConfigurationNotice(status);
    form.querySelector('button[type="submit"]').disabled = true;
    return;
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submit = form.querySelector('button[type="submit"]');
    submit.disabled = true;
    setNotice(status, 'Verificando acesso…');
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    try {
      const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
      if (error) throw error;
      if (!(await isAdministrator(data.user))) {
        const { error: signOutError } = await supabaseClient.auth.signOut();
        if (signOutError) throw signOutError;
        setNotice(status, 'Esta conta não está autorizada a acessar o painel.', 'error');
        return;
      }
      window.location.replace('admin.html');
    } catch (error) {
      setNotice(status, getLoginFailureMessage(error), 'error');
    } finally {
      submit.disabled = false;
    }
  });
}

function getLoginFailureMessage(error) {
  const message = String(error && error.message || '');
  if (/invalid login credentials|invalid credentials/i.test(message)) {
    return 'E-mail ou senha incorretos. Confira os dados e tente novamente.';
  }
  return `Não foi possível fazer login: ${message || 'erro desconhecido.'}`;
}

document.addEventListener('DOMContentLoaded', () => {
  const page = document.body.dataset.page;
  if (page === 'home') {
    loadPublicPage();
    subscribeToPublicChanges();
  }
  if (page === 'login') initializeLoginPage();
  if (page === 'admin') initializeAdminPage();
});
