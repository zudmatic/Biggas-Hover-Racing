// Drive the public front end; callers assert circuit readiness or load failures.
export async function launchFromLobby(page,{map,mode='free'}={}){
  await page.getByRole('button',{name:'Empezar',exact:true}).click();
  await page.getByRole('button',{name:'Confirmar Zud',exact:true}).click();
  await page.getByRole('button',{name:'Confirmar nave',exact:true}).click();
  if(map)await page.locator(`.lobby-map-card:has(input[value=${map}])`).click();
  if(mode==='race')await page.locator('.lobby-mode label:has(input[value=race])').click();
  await page.getByRole('button',{name:mode==='race'?'Correr':'Volar',exact:true}).click();
}
