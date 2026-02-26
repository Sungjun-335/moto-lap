import fs from 'fs';
import Papa from 'papaparse';

const fileContent = fs.readFileSync('no2.csv', 'utf8');

Papa.parse(fileContent, {
    complete: (results) => {
        try {
            const rawData = results.data as string[][];
            let headerRowIndex = -1;

            for (let i = 0; i < 50; i++) {
                if (rawData[i][0] === 'Time' && rawData[i][1] === 'Distance') {
                    headerRowIndex = i;
                    break;
                }
            }

            if (headerRowIndex === -1) return;

            const headerRow = rawData[headerRowIndex];
            const colMap = {
                tps: headerRow.indexOf('TPS'),
                gear: headerRow.indexOf('Gear'),
                latG: headerRow.indexOf('LateralAcc'), // Check exact names
                lonG: headerRow.indexOf('InlineAcc'), // Check exact names or GPS_LatAcc?
                gpsLatAcc: headerRow.indexOf('GPS_LatAcc'),
                gpsLonAcc: headerRow.indexOf('GPS_LonAcc')
            };

            console.log('Columns:', colMap);

            const sampleRows = rawData.slice(headerRowIndex + 100, headerRowIndex + 120);
            sampleRows.forEach((r, idx) => {
                console.log(`Row ${idx}: Gear=${r[colMap.gear]}, LatG=${r[colMap.latG]}, LonG=${r[colMap.lonG]}, GPS_LatG=${r[colMap.gpsLatAcc]}`);
            });

        } catch (err) {
            console.error(err);
        }
    }
});
