import * as XLSX from 'xlsx';
import { mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outputPath = join(__dirname, '../samples/customer-building-portfolio.xlsx');

mkdirSync(dirname(outputPath), { recursive: true });

const workbook = XLSX.utils.book_new();

const coverPage = [
  ['Building Portfolio Import', '', '', ''],
  ['Address', 'Building Name', 'Contact', 'Notes'],
  ['42 High Street, Manchester', 'Riverside Office', 'Tim Lees', 'Main site'],
];
XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(coverPage), 'Cover Page');

const monthlyOutlet = [
  ['Monthly Temperature Monitoring Records', '', '', '', '', '', ''],
  ['Date', 'Outlet/Location', 'Cold Mains Water Temperature °C', 'Hot Water Temperature °C', 'Name', 'Comments', 'Asset Type'],
  ['Unit 3'],
  ['05.02.2025', '1st Floor - Finance Office', '11°C', '51°C', 'Tim Lees', '', 'WHB'],
  ['05.02.2025', 'Ground Floor - Male Toilets', '10°C', '55°C', 'Tim Lees', '', 'WC'],
  ['05.02.2025', '1st Floor - Kitchen', '12°C', '48°C', 'Tim Lees', 'Check TMV', 'Bib Tap'],
];
XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(monthlyOutlet), 'Monthly Outlet');

const annualTmvs = [
  ['Annual TMV Service Records', '', '', ''],
  ['Date', 'Outlet/Location', 'Asset Type', 'Name', 'Comments'],
  ['10.01.2025', 'Ground Floor - Kitchen TMV', 'TMV', 'Tim Lees', ''],
  ['10.01.2025', '1st Floor - Shower Room', 'TMV', 'Tim Lees', ''],
];
XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(annualTmvs), 'Annual TMVs');

const annualVessels = [
  ['Annual Expansion Vessel Inspection', '', '', ''],
  ['Date', 'Outlet/Location', 'Asset Type', 'Name', 'Comments'],
  ['15.03.2025', 'Basement Plant Room', 'Expansion Vessel', 'Tim Lees', ''],
];
XLSX.utils.book_append_sheet(
  workbook,
  XLSX.utils.aoa_to_sheet(annualVessels),
  'Annual Expansion Vessels',
);

XLSX.writeFile(workbook, outputPath);
console.log(`Sample file created: ${outputPath}`);
