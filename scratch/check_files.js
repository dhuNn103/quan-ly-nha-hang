const fs = require('fs');
['unified_settings_layout.png', 'settings_verified_don_cham_24h.png', 'settings_4_inputs_step_117.png'].forEach(f => {
  const p = 'C:/Users/Ha Noi Thu Cuoi & Em/.gemini/antigravity/brain/276e6b71-e58b-462e-a7ca-625030450842/evidence/' + f;
  if (fs.existsSync(p)) {
    console.log(f, fs.statSync(p).size, fs.statSync(p).mtime);
  }
});
