// Per-university residential (all-you-care-to-eat) dining halls. Retail-only
// locations (cafes, food courts, franchise counters) are intentionally excluded.
// Data verified against each school's official dining pages; see build spec
// docs/history/build.md for source links. Notably, Rutgers' Brower Commons was
// closed ~2023 and is intentionally absent.

export interface DiningHallOption {
  name: string;
  campus: string;
}

export const UNIVERSITIES: string[] = [
  'Rutgers University',
  'Princeton University',
  'Stevens Institute of Technology',
  'NJIT',
  'Seton Hall University',
  'Montclair State University',
  'Rowan University',
];

export const DINING_HALLS_BY_UNIVERSITY: Record<string, DiningHallOption[]> = {
  'Rutgers University': [
    { name: 'Busch Dining Hall', campus: 'Busch Campus' },
    { name: 'Livingston Dining Commons', campus: 'Livingston Campus' },
    { name: 'Neilson Dining Hall', campus: 'Cook/Douglass Campus' },
  ],
  'Princeton University': [
    { name: 'Butler College Dining Hall', campus: 'Butler College' },
    { name: 'Forbes College Dining Hall', campus: 'Forbes College' },
    { name: 'Mathey College Dining Hall', campus: 'Mathey College' },
    { name: 'New College West Dining Hall', campus: 'New College West' },
    { name: 'Rockefeller College Dining Hall', campus: 'Rockefeller College' },
    { name: 'Whitman College Dining Hall', campus: 'Whitman College' },
    { name: 'Yeh College Dining Hall', campus: 'Yeh College' },
  ],
  'Stevens Institute of Technology': [
    { name: 'Pierce Dining Hall', campus: 'Central Campus' },
  ],
  NJIT: [
    { name: 'Highlander Commons', campus: 'Campus Center' },
  ],
  'Seton Hall University': [
    { name: 'Pirate Dining Room', campus: 'Bishop Dougherty University Center' },
  ],
  'Montclair State University': [
    { name: "Sam's Place", campus: 'Machuga Heights' },
    { name: 'Freeman Dining Hall', campus: 'Freeman Hall' },
  ],
  'Rowan University': [
    { name: 'Holly Pointe Commons', campus: 'Holly Pointe' },
  ],
};

/** Dining halls for a university, or [] when the university is unknown. */
export function getDiningHallsForUniversity(university: string): DiningHallOption[] {
  return DINING_HALLS_BY_UNIVERSITY[university] ?? [];
}
