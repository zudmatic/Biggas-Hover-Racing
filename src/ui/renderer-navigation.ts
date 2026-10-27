// Retain an explicitly requested compatibility backend across internal pages.
if(new URLSearchParams(location.search).get('renderer')==='webgl2'){
  document.addEventListener('click',event=>{
    const link=event.target.closest?.('a[href]');if(!link||link.hasAttribute('download'))return;
    const url=new URL(link.href);if(url.origin!==location.origin||!(/\.html$|\/$/.test(url.pathname)))return;
    url.searchParams.set('renderer','webgl2');link.href=url.href;
  });
}
