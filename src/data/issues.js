// Associations inherited from the original catalog; they are not new compatibility claims.
export const ISSUE_GROUPS = {
  x21_r1_r2_r3_z3_x218: 'x21_r1_r2_r3_z3_x218',
  x214_x218: 'x214x_218_z3',
  a1_a1pro: 'a1_a1_pro', c2: 'c2', c1: 'c1', p1: 'p1',
  z1_z1r: 'z1_z1_pro_z1_se_z1r_z1plus',
  mc11_mc21: 'mc21mc11', mx16_x25: 'mx16mx25',
  rowers: 'wm10_wr1_sa_wr20_wr3l',
};

export function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
}

function text(value) {
  if (value == null) return '';
  if (Array.isArray(value)) return value.map(text).join('\n');
  if (typeof value === 'object') return Object.entries(value).map(([k,v]) => `${k}: ${text(v)}`).join('\n');
  return String(value);
}

export function normalizeFault(fault, group, index) {
  // Two imported sheets have shifted columns. Handle them explicitly.
  const shifted = ['x21_r1_r2_r3_z3_x218', 'a1_a1_pro'].includes(group);
  const serial = text(fault['serial number']);
  const manifestation = text(fault['Fault manifestation']);
  const code = text(fault.fault_code) ||
    (shifted || group === 'wm10_wr1_sa_wr20_wr3l' ? manifestation : serial) || 'Consulta';
  const name = text(fault.description) || (shifted ? serial : manifestation) || code;
  const primary = fault.causes_and_fixes ? text(fault.causes_and_fixes) :
    text(shifted ? fault['Fault manifestation_2'] : fault['Cause analysis']);
  const parts = text(shifted ? fault['Cause analysis'] : fault['replacement of spare parts']);
  // Retain every original field, including irregular columns, repair references and tools.
  const details = Object.entries(fault).map(([key, value]) => `${key}: ${text(value)}`).join('\n\n');
  return { id: `${group}:${index}`, code, name, parts,
    fix: [primary, 'Detalle de la fuente original:', details].filter(Boolean).join('\n\n'),
    sourceGroup: group, raw: fault };
}

export function buildIssues(source) {
  if (!source?.troubleshooting) throw new Error('Falta troubleshooting en issues_complete.json');
  const issues = {};
  for (const [alias, group] of Object.entries(ISSUE_GROUPS)) {
    const faults = source.troubleshooting[group]?.faults;
    if (!Array.isArray(faults)) throw new Error(`Falta la familia ${group}`);
    issues[alias] = faults.map((fault, index) => normalizeFault(fault, group, index));
  }
  const bx2 = source.special_topics?.bx2_gas_spring_faq?.items;
  if (!Array.isArray(bx2)) throw new Error('Falta la guía BX2');
  issues.bx2 = bx2.map((item, index) => ({ id: `bx2:${index}`, code: 'FAQ',
    name: item.question, fix: item.answer, parts: '', raw: item }));
  return issues;
}
