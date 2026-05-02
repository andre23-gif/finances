import { add, all } from './db.js';

const uid = () => crypto.randomUUID();

const nextMonth = m => {
  const [y, mo] = m.split('-').map(Number);
  const d = new Date(y, mo, 1);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
};

export async function addMovementWithTriggers(m) {
  const month = m.date.slice(0,7);
  const fm = m.type === 'SALAIRE' ? nextMonth(month) : month;
  const mv = { ...m, id: uid(), month, financialMonth: fm };

  await add('movements', mv);

  if (m.type === 'SALAIRE') {
    const flags = await all('flags');
    if (!flags.some(f => f.financialMonth === fm)) {
      const rec = await all('recurring');
      rec.forEach(t => add('movements', {
        id: uid(),
        account: t.account,
        date: `${fm}-${String(t.day).padStart(2,'0')}`,
        financialMonth: fm,
        amount: t.amount,
        type: 'DEPENSE',
        status: 'APPLIQUEE',
        category: t.category,
        label: t.label
      }));
      add('flags', { financialMonth: fm });
    }
  }
}
