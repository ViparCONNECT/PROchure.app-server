import { parseOldDay } from './2026-10-profile-v2';

describe('profile v2 migration — parseOldDay', () => {
  it('parses a simple range to 24h', () => {
    expect(parseOldDay('09:00 AM to 06:30 PM')).toEqual({
      closed: false,
      open: '09:00',
      close: '18:30',
      breakStart: null,
      breakEnd: null,
    });
  });

  it('parses a lunch break', () => {
    expect(parseOldDay('09:00 AM to 01:00 PM | Lunch Break | 02:00 PM to 06:00 PM')).toEqual({
      closed: false,
      open: '09:00',
      close: '18:00',
      breakStart: '13:00',
      breakEnd: '14:00',
    });
  });

  it('treats empty / Closed / 00:00 / garbage as closed', () => {
    for (const v of [undefined, '', 'Closed', '00:00 AM to 00:00 AM', 'whenever']) {
      expect(parseOldDay(v).closed).toBe(true);
    }
  });
});
