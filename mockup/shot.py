import sys, asyncio, mimetypes, os
from playwright.async_api import async_playwright
NM='/home/claude/work/node_modules/three/'
async def main(view, out, w=1280, h=800, actions=''):
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'])
        pg = await b.new_page(viewport={'width':w,'height':h})
        logs=[]
        pg.on('console', lambda m: logs.append(f'{m.type}: {m.text}'))
        pg.on('pageerror', lambda e: logs.append(f'PAGEERROR: {e}'))
        async def three(route):
            u=route.request.url
            if '/examples/jsm/' in u: path=NM+'examples/jsm/'+u.split('/examples/jsm/')[1]
            else: path=NM+'build/three.module.js'
            await route.fulfill(path=path, content_type='text/javascript')
        await pg.route('**/cdn.jsdelivr.net/npm/three@0.170.0/**', three)
        D='/home/claude/work/node_modules/@lottiefiles/dotlottie-web/dist/'
        await pg.route('**/@lottiefiles/dotlottie-web@*/+esm', lambda r: r.fulfill(path=D+'index.js',content_type='text/javascript'))
        await pg.route('**/*dotlottie-player.wasm', lambda r: r.fulfill(path=D+'dotlottie-player.wasm',content_type='application/wasm'))
        await pg.route('**/cdn.tailwindcss.com/**', lambda r: r.fulfill(body='window.tailwind={};',content_type='text/javascript'))
        await pg.add_init_script("document.addEventListener('DOMContentLoaded',()=>{const l=document.createElement('link');l.rel='stylesheet';l.href='file:///home/claude/out/tw.css';document.head.appendChild(l)})")
        await pg.goto('file:///home/claude/out/dist.html', wait_until='load')
        await pg.wait_for_timeout(1500)
        if actions: print(await pg.evaluate(actions))
        n=int(os.environ.get('N','1')); gap=int(os.environ.get('GAP','1500'))
        for i in range(n):
            await pg.wait_for_timeout(gap)
            await pg.screenshot(path=out.replace('.png',f'_{i}.png') if n>1 else out)
        print('\n'.join(logs[:30]))
        await b.close()
view,out=sys.argv[1],sys.argv[2]
asyncio.run(main(view,out,int(sys.argv[3]) if len(sys.argv)>3 else 1280,int(sys.argv[4]) if len(sys.argv)>4 else 800,sys.argv[5] if len(sys.argv)>5 else ''))
