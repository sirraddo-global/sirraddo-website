// Dark theme for the small server-made pages (pay, change request, shop receipt). They load /assets/theme.js,
// which sets data-theme from the visitor's choice or their phone setting. Class names match those pages.
export const DARK_PAGE_CSS = `:root[data-theme="dark"]{color-scheme:dark}
:root[data-theme="dark"] body{background:#0A1226;color:#D5DCE8}
:root[data-theme="dark"] .c{background:#111B33;border-color:#2A3756}
:root[data-theme="dark"] h1,:root[data-theme="dark"] h2,:root[data-theme="dark"] .amt,:root[data-theme="dark"] .sub,:root[data-theme="dark"] .ln,:root[data-theme="dark"] .logo span{color:#E9EEF8!important}
:root[data-theme="dark"] .muted,:root[data-theme="dark"] .m{color:#A3AEC2}
:root[data-theme="dark"] a{color:#E8B746}
:root[data-theme="dark"] input,:root[data-theme="dark"] textarea{background:#0E1830;color:#E9EEF8;border-color:#3A4868}
:root[data-theme="dark"] .err{color:#FF8A80}:root[data-theme="dark"] .ok{color:#8FE0B0}
:root[data-theme="dark"] .tag.ok{background:#12382A;color:#8FE0B0}:root[data-theme="dark"] .tag.open{background:#3A2E0E;color:#F3D58A}
:root[data-theme="dark"] .item,:root[data-theme="dark"] td{border-color:#2A3756}
:root[data-theme="dark"] .up{border-color:#3A4868}`;
