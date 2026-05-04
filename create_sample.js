const xlsx = require('xlsx');

const data = [
    { Question: 'O\'zbekiston poytaxti qaysi shahar?', A: 'Samarqand', B: 'Toshkent', C: 'Buxoro', D: 'Xiva', Answer: 'B' },
    { Question: '2 + 2 nechaga teng?', A: '3', B: '4', C: '5', D: '6', Answer: 'B' },
    { Question: 'Eng katta sayyora qaysi?', A: 'Mars', B: 'Yer', C: 'Yupiter', D: 'Venera', Answer: 'C' }
];

const ws = xlsx.utils.json_to_sheet(data);
const wb = xlsx.utils.book_new();
xlsx.utils.book_append_sheet(wb, ws, "Tests");
xlsx.writeFile(wb, "sample_tests.xlsx");

console.log("Sample Excel file created: sample_tests.xlsx");
