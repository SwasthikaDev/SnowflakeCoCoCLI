// Crops app screenshots (3200x1800) into focused deck images.
const sharp = require("sharp");
const crops = {
  hero: ["overview.png", { left: 0, top: 0, width: 3200, height: 1800 }],
  evidence: ["evidence.png", { left: 600, top: 110, width: 2600, height: 1690 }],
  copilot: ["copilot.png", { left: 2330, top: 120, width: 870, height: 1000 }],
  str: ["str.png", { left: 1850, top: 120, width: 1350, height: 1640 }],
  fanout: ["fanout.png", { left: 530, top: 300, width: 1300, height: 1500 }],
};
(async () => {
  for (const [name, [src, box]] of Object.entries(crops)) {
    const m = await sharp(`shots/${src}`).metadata();
    box.width = Math.min(box.width, m.width - box.left);
    box.height = Math.min(box.height, m.height - box.top);
    await sharp(`shots/${src}`).extract(box).png().toFile(`shots/crop_${name}.png`);
    console.log(name, box.width, box.height, (box.width / box.height).toFixed(3));
  }
})();
