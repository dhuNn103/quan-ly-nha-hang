const fs = require('fs');
const file = 'C:/Users/Ha Noi Thu Cuoi & Em/.gemini/antigravity/scratch/quan-ly-nha-hang/public/index.html';
let content = fs.readFileSync(file, 'utf8');

// 1. Remove clear button from ensureHpSearchModal
const oldHeader = `<div class="hp-spotlight-hdr">
        <i class="fa-solid fa-magnifying-glass hp-spotlight-icon"></i>
        <input type="text" id="hp-search-input-field" class="hp-spotlight-input" placeholder="\${esc(hpT('searchPlaceholderSpotlight', 'Tìm trang, bài viết, dự án...'))}" autocomplete="off" oninput="hpOnSearchInput(this.value)" onkeydown="hpOnSearchKeyDown(event)">
        <button type="button" id="hp-search-clear-btn" class="hp-spotlight-clear-btn" onclick="hpClearSearchInput()" style="display:none" title="\${esc(hpT('close', 'Xóa'))}"><i class="fa-solid fa-xmark"></i></button>
        <button type="button" class="hp-spotlight-esc-btn" onclick="hpCloseSearchModal()" title="Đóng (Esc)">Esc</button>
      </div>`;

const newHeader = `<div class="hp-spotlight-hdr">
        <i class="fa-solid fa-magnifying-glass hp-spotlight-icon"></i>
        <input type="text" id="hp-search-input-field" class="hp-spotlight-input" placeholder="\${esc(hpT('searchPlaceholderSpotlight', 'Tìm trang, bài viết, dự án...'))}" autocomplete="off" oninput="hpOnSearchInput(this.value)" onkeydown="hpOnSearchKeyDown(event)">
        <button type="button" class="hp-spotlight-esc-btn" onclick="hpCloseSearchModal()" title="Đóng (Esc)">Esc</button>
      </div>`;

if (!content.includes(oldHeader)) {
  throw new Error('oldHeader not found!');
}
content = content.replace(oldHeader, newHeader);

// 2. Remove clearBtn references in JS
content = content.replace(
  "  const clearBtn = document.getElementById('hp-search-clear-btn');\n  const ftr = document.getElementById('hp-search-ftr-content');",
  "  const ftr = document.getElementById('hp-search-ftr-content');"
);

content = content.replace(
  "  if (clearBtn) clearBtn.style.display = 'none';\n",
  ""
);

content = content.replace(
`function hpOnSearchInput(val) {
  const clearBtn = document.getElementById('hp-search-clear-btn');
  if (clearBtn) {
    clearBtn.style.display = (val && val.trim()) ? 'flex' : 'none';
  }
  hpSpotlightIndex = 0;
  hpRenderSearchResults(val);
}`,
`function hpOnSearchInput(val) {
  hpSpotlightIndex = 0;
  hpRenderSearchResults(val);
}`
);

// 3. Remove CSS for .hp-spotlight-clear-btn
const oldClearCss = `.hp-spotlight-clear-btn {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: none;
  background: #f1f5f9;
  color: #64748b;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  cursor: pointer;
  transition: all 0.15s;
  flex-shrink: 0;
  padding: 0;
}
.hp-spotlight-clear-btn:hover {
  background: #e2e8f0;
  color: #0f172a;
}
`;

if (content.includes(oldClearCss)) {
  content = content.replace(oldClearCss, '');
}

fs.writeFileSync(file, content, 'utf8');
console.log('SUCCESS: Clear button X removed completely!');
