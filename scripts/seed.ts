import { ensureDemoDataSeeded } from '../lib/db/seed';

const forceReset = process.argv.includes('--reset');
ensureDemoDataSeeded(forceReset);
console.log(`Supplier Recovery Desk demo database ${forceReset ? 'reset and ' : ''}seeded successfully.`);
