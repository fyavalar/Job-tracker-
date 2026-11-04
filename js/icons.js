const PATHS = {
  home: '<path d="M4 11.2 12 4l8 7.2"/><path d="M7 10.8V20h10V10.8"/>',
  jobs: '<path d="M8 7V5.8A1.8 1.8 0 0 1 9.8 4h4.4A1.8 1.8 0 0 1 16 5.8V7"/><path d="M4 9.5h16v8.2A2.3 2.3 0 0 1 17.7 20H6.3A2.3 2.3 0 0 1 4 17.7Z"/><path d="M4 13h16"/>',
  calendar: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3.5V7M16 3.5V7M4 10h16"/>',
  money: '<circle cx="12" cy="12" r="8"/><path d="M12 7.8v8.4M14.6 9.4c-.5-.8-1.3-1.1-2.4-1.1-1.5 0-2.4.7-2.4 1.6S11 11.5 12.4 11.8s2.4.8 2.4 1.8-.9 1.6-2.4 1.6c-1.1 0-1.9-.3-2.4-1.1"/>',
  more: '<rect x="4" y="4" width="6.5" height="6.5" rx="1.4"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.4"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.4"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.4"/>',
  search: '<circle cx="11" cy="11" r="6"/><path d="m16 16 4 4"/>',
  back: '<path d="M15 5 8 12l7 7"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  phone: '<path d="M8 4h2.2l1.2 3-1.6 1a12 12 0 0 0 5.2 5.2l1-1.6 3 1.2V17a2 2 0 0 1-2.2 2A14 14 0 0 1 5 8.2 2 2 0 0 1 7 6l1-2Z"/>',
  message: '<path d="M5 6.5h14v9H8l-3 2.5Z"/>',
  mail: '<rect x="3.5" y="5.5" width="17" height="13" rx="2"/><path d="m4 7 8 6 8-6"/>',
  pin: '<path d="M12 21s6-5.2 6-10a6 6 0 1 0-12 0c0 4.8 6 10 6 10Z"/><circle cx="12" cy="11" r="1.8"/>',
  user: '<circle cx="12" cy="8" r="3.2"/><path d="M5.5 19.2a6.5 6.5 0 0 1 13 0"/>',
  doc: '<path d="M7 3.5h7l4 4V20a1.5 1.5 0 0 1-1.5 1.5h-9.5A1.5 1.5 0 0 1 6 20V5A1.5 1.5 0 0 1 7.5 3.5H7Z"/><path d="M14 3.8V8h4.2"/><path d="M8.5 12.5h7M8.5 16h5"/>',
  camera: '<path d="M4 8.5h3l1.4-2h7.2L17 8.5h3V19H4Z"/><circle cx="12" cy="13.5" r="3"/>',
  slab: '<path d="M4 8.5 12 4l8 4.5-8 4.5Z"/><path d="M4 8.5V16L12 20.5 20 16V8.5"/><path d="M12 13v7.5"/>',
  sun: '<circle cx="12" cy="12" r="3.2"/><path d="M12 3.5v2M12 18.5v2M3.5 12h2M18.5 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4"/>',
  moon: '<path d="M15 3.5a8 8 0 1 0 5.5 13.8A7 7 0 0 1 15 3.5Z"/>',
  trash: '<path d="M5 7.5h14"/><path d="M9 7.5V5.8h6V7.5"/><path d="M7.5 7.5 8.2 19h7.6l.7-11.5"/>',
  check: '<path d="m5 12.5 4.2 4.2L19 7.5"/>',
  download: '<path d="M12 4v10"/><path d="m8 10 4 4 4-4"/><path d="M5 19h14"/>',
  upload: '<path d="M12 16V6"/><path d="m8 10 4-4 4 4"/><path d="M5 19h14"/>',
  print: '<path d="M7 9V4h10v5"/><path d="M6 17H4.8A1.8 1.8 0 0 1 3 15.2V11a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4.2a1.8 1.8 0 0 1-1.8 1.8H17"/><rect x="7" y="14" width="10" height="6"/>',
  share: '<circle cx="6" cy="12" r="2"/><circle cx="17" cy="7" r="2"/><circle cx="17" cy="17" r="2"/><path d="m8 11 7-3.2M8 13l7 3.2"/>',
  tag: '<path d="M4 12.5V5h7.5L20 13.5 13.5 20Z"/><circle cx="8.2" cy="8.2" r="1"/>',
  chart: '<path d="M4 19h16"/><path d="M7 16v-4"/><path d="M12 16V7"/><path d="M17 16v-7"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 4.5v2M12 17.5v2M4.5 12h2M17.5 12h2M6.4 6.4l1.4 1.4M16.2 16.2l1.4 1.4M17.6 6.4 16.2 7.8M7.8 16.2 6.4 17.6"/>',
  box: '<path d="M4 8.5 12 4l8 4.5-8 4.5Z"/><path d="M4 8.5 12 13v7.5L4 16Z"/><path d="M20 8.5 12 13v7.5L20 16Z"/>'
};

export function icon(name) {
  const body = PATHS[name] || PATHS.more;
  return `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
}
