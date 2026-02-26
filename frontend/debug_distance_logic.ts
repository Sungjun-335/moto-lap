
import fs from 'fs';
import Papa from 'papaparse';

const fileContent = fs.readFileSync('./no2.csv', 'utf8');

Papa.parse(fileContent, {
    complete: (results) => {
        const rawData = results.data as string[][];
        // Mimic parser logic
        let headerRowIndex = -1;

        // Find header
        for (let i = 0; i < 50; i++) {
            if (rawData[i][0] === 'Time' && rawData[i][1] === 'Distance') {
                headerRowIndex = i;
                break;
            }
        }

        if (headerRowIndex === -1) { console.log("No header"); return; }

        const headerRow = rawData[headerRowIndex];
        const colMap = {
            time: headerRow.indexOf('Time'),
            distance: headerRow.indexOf('Distance')
        };

        console.log("Header found at", headerRowIndex);

        let dataRowStartIndex = headerRowIndex + 1;
        for (let i = headerRowIndex + 1; i < rawData.length; i++) {
            const row = rawData[i];
            if (!row || row.length <= colMap.time) continue;
            const csvTime = parseFloat(row[colMap.time]);
            if (!isNaN(csvTime)) {
                dataRowStartIndex = i;
                break;
            }
        }

        let distanceOffset = 0;
        let lastCsvDistance = 0;

        console.log("Data start index:", dataRowStartIndex);

        // Check first few resets
        let resetCount = 0;

        for (let i = dataRowStartIndex; i < rawData.length; i++) {
            const row = rawData[i];
            if (!row || row.length <= colMap.time) continue;

            const csvTime = parseFloat(row[colMap.time]);
            if (isNaN(csvTime)) continue;

            let csvDistance = parseFloat(row[colMap.distance]);
            if (isNaN(csvDistance)) csvDistance = 0;

            // Logic from parser
            if (lastCsvDistance > 0.5 && csvDistance < 0.1) {
                console.log(`Reset detected at Row ${i} (Time: ${csvTime}). Last: ${lastCsvDistance}, Curr: ${csvDistance}. New Offset: ${distanceOffset + lastCsvDistance}`);
                distanceOffset += lastCsvDistance;
                resetCount++;
            }

            lastCsvDistance = csvDistance;
            const sessionDistance = distanceOffset + csvDistance;

            // Log around potential reset points (e.g. around 33s, 116s based on beacon markers)
            // Beacon Markers: 33.629, 116.853
            if (csvTime > 33.5 && csvTime < 33.8) {
                // console.log(`Time: ${csvTime}, RawDist: ${csvDistance}, SessDist: ${sessionDistance}`);
            }
        }
        console.log("Total resets detected:", resetCount);
    }
});
