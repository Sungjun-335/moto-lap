import fs from 'fs';
import Papa from 'papaparse';

const fileContent = fs.readFileSync('no2.csv', 'utf8');

Papa.parse(fileContent, {
    complete: (results) => {
        try {
            const rawData = results.data;
            console.log('Total rows:', rawData.length);

            const metadata = {};
            let headerRowIndex = -1;

            for (let i = 0; i < 50; i++) {
                const row = rawData[i];
                if (row && row.length >= 2) {
                    console.log(`Row ${i}:`, row.slice(0, 5)); // Log start of each row
                    if (row[0] === 'Venue') metadata.venue = row[1];
                    // ... other metadata

                    if (row[0] === 'Time' && row[1] === 'Distance') {
                        headerRowIndex = i;
                        console.log('Found Header at index:', i);
                        break;
                    }
                }
            }

            if (headerRowIndex === -1) {
                console.error('Header not found');
                return;
            }

            const headerRow = rawData[headerRowIndex];
            const colMap = {
                time: headerRow.indexOf('Time'),
                distance: headerRow.indexOf('Distance'),
                lat: headerRow.indexOf('GPS_Latitude'),
                lon: headerRow.indexOf('GPS_Longitude'),
                speed: headerRow.indexOf('GPS_Speed'),
                rpm: headerRow.indexOf('RPM'),
                latG: headerRow.indexOf('LateralAcc'),
                lonG: headerRow.indexOf('InlineAcc'),
            };

            console.log('Column Mapping:', colMap);

            if (colMap.lat === -1 || colMap.lon === -1) {
                console.error('Missing expected columns GPS_Latitude/Longitude');
            }

            let dataCount = 0;
            for (let i = headerRowIndex + 1; i < Math.min(rawData.length, headerRowIndex + 20); i++) {
                const row = rawData[i];
                if (!row || row.length < headerRow.length) continue;

                const timeVal = parseFloat(row[colMap.time]);
                const lat = parseFloat(row[colMap.lat]);

                console.log(`Row ${i} check: Time=${row[colMap.time]} (${timeVal}), Lat=${row[colMap.lat]} (${lat})`);

                if (!isNaN(timeVal) && !isNaN(lat)) {
                    dataCount++;
                }
            }
            console.log('Sample invalid/valid check done.');

        } catch (err) {
            console.error(err);
        }
    }
});
