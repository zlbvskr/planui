export let creationOrigin:DOMRect|null=null;
/** Capture before React removes the orb; Sheet uses transform + clip-path only. */
export function transitionCreation(update:()=>void):void {
 const orb=document.querySelector<HTMLElement>(innerWidth<1024?'[data-testid=mobile-global-create-button]':'[data-testid=desktop-global-create-button]');
 if(orb)creationOrigin=orb.getBoundingClientRect();
 update();
}
