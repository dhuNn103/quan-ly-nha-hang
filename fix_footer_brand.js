const fs = require('fs');
const file = 'C:/Users/Ha Noi Thu Cuoi & Em/.gemini/antigravity/scratch/quan-ly-nha-hang/public/index.html';
let content = fs.readFileSync(file, 'utf8');

// 1. Update CSS around line 5711
const oldCss = `.hp-footer-brand {
  display: flex; align-items: center; gap: 10px; margin-bottom: 14px;
}
.hp-footer-brand-title {
  font-family: var(--hp-font-serif);
  font-size: 20px; font-weight: 700; color: #ffffff; margin: 0; line-height: 1.15;
}
.hp-footer-brand-sub {
  font-size: 11px; color: #8fa096; letter-spacing: 0.5px;
}`;

const newCss = `.hp-footer-brand {
  display: flex; align-items: center; gap: 12px; margin-bottom: 14px;
}
.hp-footer-brand-text {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: flex-start;
  gap: 3px;
}
.hp-footer-brand-title {
  display: block;
  font-family: var(--hp-font-serif);
  font-size: 20px; font-weight: 700; color: #ffffff; margin: 0; line-height: 1.2;
}
.hp-footer-brand-sub {
  display: block;
  font-size: 11px; color: #8fa096; letter-spacing: 0.5px; margin: 0; line-height: 1.2;
}`;

if (!content.includes(oldCss)) {
  throw new Error('oldCss not found!');
}
content = content.replace(oldCss, newCss);

// 2. Update Footer on Full Menu Page
const oldMenuFooter = `<div class="hp-footer-brand">
              \${hpFooterLogoHtml}
              <div class="hp-footer-brand-text">
                <span class="hp-footer-brand-title">\${esc(restNameDisplay)}</span>
                <span class="hp-footer-brand-sub">\${esc(sloganDisplay)}</span>
              </div>
            </div>`;

const newMenuFooter = `<div class="hp-footer-brand">
              \${hpFooterLogoHtml}
              <div class="hp-footer-brand-text">
                <div class="hp-footer-brand-title">\${esc(restNameDisplay)}</div>
                <div class="hp-footer-brand-sub">\${esc(sloganDisplay)}</div>
              </div>
            </div>`;

if (!content.includes(oldMenuFooter)) {
  throw new Error('oldMenuFooter not found!');
}
content = content.replace(oldMenuFooter, newMenuFooter);

// 3. Update Footer on About Page
const oldAboutFooter = `<div class="hp-footer-brand">
              \${hpFooterLogoHtml}
              <div class="hp-footer-brand-text">
                <span class="hp-footer-brand-title">\${esc(restNameDisplay)}</span>
                <span class="hp-footer-brand-sub">\${esc(sloganDisplay)}</span>
              </div>
            </div>`;

content = content.replace(oldAboutFooter, newMenuFooter);

// 4. Update Footer on Homepage
const oldHomeFooter = `<div class="hp-footer-brand">
              \${hpFooterLogoHtml}
              <div>
                <div class="hp-footer-brand-title">\${esc(restNameDisplay)}</div>
                <div class="hp-footer-brand-sub">\${esc(sloganDisplay)}</div>
              </div>
            </div>`;

const newHomeFooter = `<div class="hp-footer-brand">
              \${hpFooterLogoHtml}
              <div class="hp-footer-brand-text">
                <div class="hp-footer-brand-title">\${esc(restNameDisplay)}</div>
                <div class="hp-footer-brand-sub">\${esc(sloganDisplay)}</div>
              </div>
            </div>`;

if (!content.includes(oldHomeFooter)) {
  throw new Error('oldHomeFooter not found!');
}
content = content.replace(oldHomeFooter, newHomeFooter);

fs.writeFileSync(file, content, 'utf8');
console.log('SUCCESS: Footer brand text updated to stack vertically!');
