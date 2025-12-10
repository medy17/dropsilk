import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';

describe('XLSX Library', () => {
    it('should expose utils.sheet_to_html', () => {
        expect(XLSX.utils).toBeDefined();
        expect(typeof XLSX.utils.sheet_to_html).toBe('function');
    });

    it('should read a simple excel file (mock data)', () => {
        // Create a simple workbook
        const ws = XLSX.utils.aoa_to_sheet([['A1', 'B1'], ['A2', 'B2']]);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
        
        // Write to buffer and read back to verify round trip (simulating the preview flow)
        const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
        const readWb = XLSX.read(wbout, { type: 'array' });
        
        expect(readWb.SheetNames).toContain('Sheet1');
        const html = XLSX.utils.sheet_to_html(readWb.Sheets['Sheet1']);
        expect(html).toContain('<table>');
        expect(html).toContain('A1');
    });
});
