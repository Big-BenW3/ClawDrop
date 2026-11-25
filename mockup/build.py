import re,io
NM='/home/claude/work/node_modules/lucide-static/icons/'
def icon(name, sw=2.25, cls=''):
    svg=open(NM+name+'.svg',encoding='utf8').read()
    inner=re.search(r'<svg[^>]*>(.*)</svg>',svg,re.S).group(1)
    inner=re.sub(r'\s+',' ',inner).strip()
    return ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" '
            f'stroke-width="{sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" '
            f'class="inline-block shrink-0 w-[1.05em] h-[1.05em] align-[-0.16em] {cls}">{inner}</svg>')
s=open('claw-drop.html',encoding='utf8').read()
eng=open('engine.js',encoding='utf8').read()

s=s.replace('/*__GALAXY__*/',open('bg-lite.js',encoding='utf8').read())
# --- 3D: drop r128 classic script, inject importmap + module engine, remove old class
s=s.replace('<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>',
'''<script type="importmap">
  { "imports": {
      "three": "https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js",
      "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/" } }
  </script>''')
a=s.index('    class ClawMachine3D {')
b=s.index('    let heroMachineEngine = null;')
s=s[:a]+'    /* ClawMachine3D is defined by the module script at the end of <body> (window.ClawMachine3D). */\n\n'+s[b:]
s=s.replace('</body>','<script type="module">\n'+eng+'\n</script>\n</body>')
# guard on THREE existing at load
s=s.replace("typeof THREE !== 'undefined'","typeof ClawMachine3D !== 'undefined'")

# --- icons
def rep(old,new,count=None):
    global s
    assert old in s, old
    s=s.replace(old,new)
rep('<span class="text-accent text-lg">✦</span>','<span class="text-accent text-lg">'+icon('sparkles',2)+'</span>')
rep('<span class="text-win text-lg">◈</span>','<span class="text-win text-lg">'+icon('gem',2)+'</span>')
for c in ('text-win','text-accent','text-legendary'):
    rep(f'<span class="{c}">✓</span>',f'<span class="{c}">'+icon('check',3)+'</span>')
rep('Enter Arcade →','Enter Arcade '+icon('arrow-right',2.5))
rep('class="text-muted hover:text-ink text-sm cursor-pointer">✕</button>','class="text-muted hover:text-ink text-sm cursor-pointer">'+icon('x',2.5)+'</button>')
s=s.replace('View on explorer ↗','View on explorer '+icon('arrow-up-right',2.5))
s=s.replace('Verify on-chain ↗','Verify on-chain '+icon('arrow-up-right',2.5))
rep('<span>✦ CAUGHT!</span>','<span class="inline-flex items-center gap-1.5">'+icon('sparkles',2.5)+' CAUGHT!</span>')
rep("'<span>✦ CAUGHT!</span>'","'<span>X</span>") if False else None
s=s.replace('font-bold text-xl">✓</div>','font-bold text-xl">'+icon('check',3)+'</div>')
s=s.replace('✓ Minted to wallet',icon('check',3)+' Minted to wallet')
s=s.replace('✓ NFT Transferred to',icon('check',3)+' NFT Transferred to')
s=s.replace('GRIP LOCKED ✓','GRIP LOCKED '+icon('check',3))
s=s.replace("'VERIFIED WIN ✓'","'VERIFIED WIN '+`"+icon('check',3)+"`")
s=s.replace('← Back to Arcade',icon('arrow-left',2.5)+' Back to Arcade')
s=s.replace('<div class="text-3xl">🕹️</div>','<div class="text-3xl text-accent flex justify-center">'+icon('joystick',1.75,'!w-[1.2em] !h-[1.2em]')+'</div>')
s=s.replace('↺ Reset Healthy State',icon('rotate-ccw',2.5)+' Reset Healthy State')
s=s.replace('→ WIN','<span class="mx-0.5">'+icon('arrow-right',2.5)+'</span> WIN')
s=s.replace('→ GRIP','<span class="mx-0.5">'+icon('arrow-right',2.5)+'</span> GRIP')
s=s.replace('TX: 8mQ4...7xLp ↗','TX: 8mQ4...7xLp '+icon('arrow-up-right',2.5))
s=s.replace('Verify ↗','Verify '+icon('arrow-up-right',2.5))
s=s.replace("txRow.textContent = `TX: ${txShort} ↗`;","txRow.innerHTML = `TX: ${txShort} "+icon('arrow-up-right',2.5)+"`;")
# modal close glyph on line ~839
s=re.sub(r'(closeOddsModal\(\)"[^>]*>)\s*✕\s*(</button>)',lambda m:m.group(1)+icon('x',2.5)+m.group(2),s)
open('dist.html','w',encoding='utf8').write(s)
left=[(i,l.strip()[:120]) for i,l in enumerate(s.split('\n'),1) if re.search(r'[←-⇿⌀-➿☀-⛿\U0001F000-\U0001FFFF️]',l) and '<svg' not in l]
print('leftover',left)
# --- Lottie (free, Lottie Simple License) : data + dotLottie player
s=open('dist.html',encoding='utf8').read()
s=s.replace('</body>','<script>'+open('lottie-data.js').read()+'</script>\n'+open('lottie-mod.html',encoding='utf8').read()+'</body>')
open('dist.html','w',encoding='utf8').write(s)
