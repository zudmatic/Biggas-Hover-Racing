// Triangle counts describe the source GLBs; runtime meshes include repaired surfaces and attached details.
// Final revisions selected by the supplied catalog; earlier exports are not additional hats.
export const HAT_CATALOG=[
  {
    "id": "samurai_kasa",
    "name": "Samurai Kasa",
    "file": "001_samurai_kasa_detailed_v01.glb",
    "preview": "001_samurai_kasa_detailed_v01.jpg",
    "triangles": 6728
  },
  {
    "id": "cloud_chef",
    "name": "Cloud Chef",
    "file": "006_cloud_chef_detailed_v03.glb",
    "preview": "006_cloud_chef_detailed_v03.jpg",
    "triangles": 6416
  },
  {
    "id": "crescent_wizard",
    "name": "Crescent Wizard",
    "file": "007_crescent_wizard_detailed_v01.glb",
    "preview": "007_crescent_wizard_detailed_v01.jpg",
    "triangles": 3656
  }
];

export const HAT_DEFAULTS=Object.freeze({
  hatModel:'beanie',hatOffsetX:0,hatOffsetY:0,hatOffsetZ:0,hatYaw:0,hatTilt:0,
  hatTint:'#ffffff',hatRoughness:1,hatMetalness:0,
  hatAutoFit:true,hatCrownHeight:1,
});
export const hatAssetUrl=file=>`${import.meta.env?.BASE_URL??'/'}models/hats/${file}`;

// Approved fits shared by the editor, reset action and scene.
export const HAT_PRESETS=Object.freeze({
  crescent_wizard:{hatOffsetY:-.35,hatYaw:10,hatTilt:5,hatTint:'#bcc6fb',hatMetalness:.58,hatCrownHeight:1.2,hatSize:1.07},
  samurai_kasa:{hatOffsetY:-.35,hatTilt:2,hatTint:'#fff8e0',hatMetalness:.34,hatCrownHeight:1.2,hatSize:1.03},
  cloud_chef:{hatOffsetY:-.35,hatMetalness:.35,hatCrownHeight:1.2,hatSize:1.04},
});
export const hatDefaults=id=>({...HAT_DEFAULTS,hatSize:1,showHat:true,...HAT_PRESETS[id],hatModel:HAT_CATALOG.some(hat=>hat.id===id)||id==='none'?id:'beanie'});
