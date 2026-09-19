const ICONS = {
  book: 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20M4 4.5A2.5 2.5 0 0 1 6.5 7H20v13H6.5A2.5 2.5 0 0 1 4 17.5v-13z',
  'book-open': 'M2 4h6a4 4 0 0 1 4 4v12a3 3 0 0 0-3-3H2V4zm20 0h-6a4 4 0 0 0-4 4v12a3 3 0 0 1 3-3h7V4z',
  route: 'M4 18h4M6 18V9m0 0c3.2-3.4 6.8 3.4 12 0m0 0v9m2-11h-4',
  file: 'M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 2v6h6',
  spark: 'M12 3l1.4 5.2L18.5 9.5 13.4 11 12 16.2 10.6 11 5.5 9.5l5.1-1.3L12 3zM18.2 15.2l.7 2.1 2.1.7-2.1.7-.7 2.1-.7-2.1-2.1-.7 2.1-.7.7-2.1z',
  user: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8',
  folder: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  tag: 'M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8zM7.5 7.5h.01',
  check: 'M20 6 9 17l-5-5',
  play: 'M8 6.5v11l9-5.5-9-5.5z',
  slides: 'M3 5h18v11H3zM8 20h8M12 16v4',
  send: 'M22 2 11 13M22 2l-7 20-4-9-9-4L22 2z',
  chat: 'M21 14a2 2 0 0 1-2 2H8l-5 4V6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z',
  mic: 'M12 3a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3zM19 11a7 7 0 0 1-14 0M12 18v3M8 21h8',
  leaf: 'M11 20A7 7 0 0 1 11 6c5.2 0 8.2 4.1 9.2 8.2C16.2 15.4 13.4 17.6 11 20zM11 6S11.6 10 9 14',
  empty: 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20M4 4.5A2.5 2.5 0 0 1 6.5 7H20v13H6.5A2.5 2.5 0 0 1 4 17.5v-13zM8 12h8M8 15.5h5',
  upload: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12',
  refresh: 'M21 4v6h-6M3 20v-6h6M18.4 8.4A8 8 0 0 0 6.2 7.1L3 10M21 14l-3.2 2.9A8 8 0 0 1 5.6 15.6',
  alert: 'M10.3 4.1 2.1 18.2A1.8 1.8 0 0 0 3.7 21h16.6a1.8 1.8 0 0 0 1.6-2.8L13.7 4.1a1.8 1.8 0 0 0-3.4 0zM12 9v4M12 17h.01',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3',
  chevron: 'M9 6l6 6-6 6'
}

function toSrc(name, color) {
  const d = ICONS[name] || ICONS.leaf
  const stroke = color || '#5C7A5A'
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="' +
    stroke + '" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="' + d + '"/></svg>'
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
}

Component({
  properties: {
    name: { type: String, value: 'leaf' },
    size: { type: Number, value: 40 },
    color: { type: String, value: '#5C7A5A' }
  },
  data: {
    src: ''
  },
  observers: {
    'name, color': function (name, color) {
      this.setData({ src: toSrc(name, color) })
    }
  },
  attached() {
    this.setData({ src: toSrc(this.data.name, this.data.color) })
  }
})
