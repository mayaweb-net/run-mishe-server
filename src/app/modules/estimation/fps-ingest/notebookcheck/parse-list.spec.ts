import { describe, expect, it } from 'vitest';
import { parseNbcDesktopList } from './parse-list';

const FIXTURE = `
<html><body>
<table class="sortable" id="gpulist_1">
  <tr class="header">
    <td>Pos</td><td>Model</td><td colspan="6">Cyberpunk 2077 (2023)</td>
  </tr>
  <tr>
    <td>low1920x1080Low Preset (FSR off)</td>
    <td>med.1920x1080Medium Preset (FSR off)</td>
    <td>high1920x1080High Preset (FSR off)</td>
    <td>ultra1920x1080Ultra Preset (FSR off)</td>
    <td>QHD2560x1440Ultra Preset (FSR off)</td>
    <td>4K3840x2160Ultra Preset (FSR off)</td>
  </tr>
  <tr class="desk_even">
    <td class="specs poslabel">2</td>
    <td class="specs fullname">NVIDIA GeForce RTX 4090</td>
    <td class="gg_fld"><span class="bl_med_val_990_3016">212</span><sup>n22</sup></td>
    <td class="gg_fld"><span class="bl_med_val_990_3017">215</span><sup>n22</sup></td>
    <td class="gg_fld"><span class="bl_med_val_990_3018">199.05</span><sup>n22</sup></td>
    <td class="gg_fld"><span class="bl_med_val_990_3019">184.8</span><sup>n24</sup></td>
    <td class="gg_fld"><span class="bl_med_val_990_3020">153.4</span><sup>n23</sup></td>
    <td class="gg_fld"><span class="bl_med_val_990_3021">75.65</span><sup>n24</sup></td>
  </tr>
</table>
</body></html>
`;

describe('parseNbcDesktopList', () => {
  it('extracts the six target settings for a GPU row', () => {
    const rows = parseNbcDesktopList(FIXTURE, {
      gameSlug: 'cyberpunk-2077',
      nbcGameId: 990,
      sourceUrl: 'https://www.notebookcheck.net/example.html',
    });
    expect(rows).toHaveLength(6);
    expect(rows.map((row) => `${row.resolution}:${row.preset}`)).toEqual([
      'R1080P:LOW',
      'R1080P:MEDIUM',
      'R1080P:HIGH',
      'R1080P:ULTRA',
      'R1440P:ULTRA',
      'R2160P:ULTRA',
    ]);
    expect(rows[0]?.avgFps).toBe(212);
    expect(rows[0]?.sampleCount).toBe(22);
    expect(rows[0]?.gpuName).toContain('RTX 4090');
  });
});
