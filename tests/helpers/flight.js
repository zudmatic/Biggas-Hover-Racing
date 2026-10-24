// Drive the public front end; callers assert circuit readiness or load failures.
export async function launchFromLobby(page,{map}={}){
  await page.getByRole('button',{name:'Jugar',exact:true}).click();
  await page.getByRole('button',{name:'Confirmar Zud',exact:true}).click();
  await page.getByRole('button',{name:'Confirmar nave',exact:true}).click();
  if(map)await page.locator(`.lobby-map-card:has(input[value=${map}])`).click();
  await page.getByRole('button',{name:'Volar',exact:true}).click();
}

export async function openFlightOptions(page){
  const app=page.locator('.flight-app');
  if(!await app.count())return;
  const phase=await app.getAttribute('data-phase');
  if(phase==='flying')await page.keyboard.press('Escape');
  const options=page.locator('.flight-options');
  if(!await options.evaluate(el=>el.open))await options.locator('summary').click();
}

export async function withFlightOptions(page,action){
  const phase=await page.locator('.flight-app').getAttribute('data-phase');
  await openFlightOptions(page);
  await action();
  if(phase==='flying')await page.getByRole('button',{name:'Continuar',exact:true}).click();
}
