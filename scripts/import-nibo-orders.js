import { importNiboOrders } from '../src/services/niboImport.js';

const pageSize = Number(process.env.NIBO_IMPORT_PAGE_SIZE ?? 1000);
const maxPages = process.env.NIBO_IMPORT_MAX_PAGES
  ? Number(process.env.NIBO_IMPORT_MAX_PAGES)
  : null;
const offset = Number(process.env.NIBO_IMPORT_OFFSET ?? 0);

const result = await importNiboOrders({ pageSize, maxPages, offset });
console.log(JSON.stringify(result, null, 2));
