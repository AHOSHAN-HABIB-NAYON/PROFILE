/* =========================================================
   A.H NAYON — Portfolio interactions
   ========================================================= */
(function () {
    'use strict';

    const $ = (sel, root = document) => root.querySelector(sel);
    const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

    /* ---------- Data ---------- */
    const techSkills = [
        { icon: 'bx bxl-html5', name: 'HTML5', percent: 92 },
        { icon: 'bx bxl-css3', name: 'CSS3', percent: 88 },
        { icon: 'bx bxl-javascript', name: 'JS', percent: 85 },
        { icon: 'bx bxl-python', name: 'Python', percent: 82 },
        { icon: 'bx bxl-php', name: 'PHP', percent: 76 },
        { icon: 'bx bxl-java', name: 'Java', percent: 75 },
        { icon: 'bx bxl-c-plus-plus', name: 'C/C++', percent: 80 },
        { icon: 'bx bx-data', name: 'SQL', percent: 84 },
        { icon: 'bx bxl-react', name: 'React', percent: 72 },
        { icon: 'bx bxl-nodejs', name: 'Node.js', percent: 68 },
        { icon: 'bx bxl-github', name: 'Git', percent: 79 }
    ];
    const profSkills = [
        { icon: 'bx bx-brain', name: 'Problem Solving', percent: 88 },
        { icon: 'bx bx-palette', name: 'Creativity', percent: 85 },
        { icon: 'bx bx-chat', name: 'Communication', percent: 92 },
        { icon: 'bx bx-group', name: 'Teamwork', percent: 94 },
        { icon: 'bx bx-trophy', name: 'Leadership', percent: 80 },
        { icon: 'bx bx-time', name: 'Time Mgmt', percent: 86 },
        { icon: 'bx bx-adjust', name: 'Adaptability', percent: 90 },
        { icon: 'bx bx-customize', name: 'Critical Think', percent: 87 }
    ];
    const linkSets = {
        myown: {
            label: 'My Own',
            urls: ['jsjssn.com', 'sjhsh.com', 'shhsusb.vom', 'nsnsndn.co', 'snjsisjs.vop', 'sbbsbssb.io']
        },
        vip: {
            label: 'VIP',
            urls: ['affpaying.com', 'sp0m.co', 'blackhatworld.com', 'saveweb2zip.com', 'Sbjssjjs.com', 'Snshzj.com', 'Snsndn.com', 'Sjsjjs.com']
        },
        others: {
            label: 'Others',
            urls: ['nayon8av.op', 'gagav.no', 'vaiaj.vip']
        }
    };

    /* Run a render loop only while an element is on screen */
    function loopWhileVisible(el, frame) {
        let raf = 0;
        let visible = false;
        const tick = (t) => {
            frame(t);
            raf = visible && !document.hidden ? requestAnimationFrame(tick) : 0;
        };
        const start = () => { if (!raf && visible && !document.hidden) raf = requestAnimationFrame(tick); };
        new IntersectionObserver((entries) => {
            visible = entries[0].isIntersecting;
            start();
        }).observe(el);
        document.addEventListener('visibilitychange', start);
    }

    function fitCanvas(canvas) {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const w = canvas.clientWidth;
        const h = canvas.clientHeight;
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
        const ctx = canvas.getContext('2d');
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        return { ctx, w, h };
    }

    /* ---------- Preloader ---------- */
    const preloader = $('#preloader');
    const loaderCount = $('#loaderCount');
    const loaderBar = $('#loaderBar');
    let loaded = document.readyState === 'complete';
    window.addEventListener('load', () => { loaded = true; });
    const loadStart = performance.now();
    let progress = 0;

    function loaderTick() {
        const elapsed = performance.now() - loadStart;
        const cap = loaded || elapsed > 3500 ? 100 : 90;
        progress += (cap - progress) * 0.08 + 0.4;
        progress = Math.min(progress, cap);
        const p = Math.floor(progress);
        loaderCount.textContent = p + '%';
        loaderBar.style.width = p + '%';
        if (p >= 100 && elapsed > 700) {
            finishLoading();
        } else {
            requestAnimationFrame(loaderTick);
        }
    }

    function finishLoading() {
        preloader.classList.add('done');
        document.body.classList.remove('is-loading');
        splitTitle();
        startTyped();
    }

    if (reduceMotion) {
        finishLoading();
    } else {
        requestAnimationFrame(loaderTick);
    }

    /* ---------- Hero title split ---------- */
    function splitTitle() {
        const title = $('#heroTitle');
        if (!title || title.dataset.split) return;
        title.dataset.split = '1';
        let i = 0;
        const wrap = (text, parent) => {
            const frag = document.createDocumentFragment();
            for (const ch of text) {
                const s = document.createElement('span');
                s.className = 'char' + (ch === ' ' ? ' space' : '');
                s.textContent = ch === ' ' ? ' ' : ch;
                s.style.setProperty('--c', i++);
                s.setAttribute('aria-hidden', 'true');
                frag.appendChild(s);
            }
            parent.appendChild(frag);
        };
        Array.from(title.childNodes).forEach((node) => {
            if (node.nodeType === 3) {
                const text = node.textContent;
                const holder = document.createDocumentFragment();
                const tmp = document.createElement('span');
                wrap(text, tmp);
                while (tmp.firstChild) holder.appendChild(tmp.firstChild);
                title.replaceChild(holder, node);
            } else {
                const text = node.textContent;
                node.textContent = '';
                wrap(text, node);
                const chars = $$('.char', node);
                node.classList.add('split');
                chars.forEach((c, k) => {
                    c.style.setProperty('--k', k);
                    c.style.setProperty('--n', chars.length);
                });
            }
        });
    }

    /* ---------- Typed ---------- */
    function startTyped() {
        if (typeof Typed === 'undefined' || !$('#typed')) {
            const t = $('#typed');
            if (t) t.textContent = 'Web Development';
            return;
        }
        new Typed('#typed', {
            strings: ['Mechanical Engineering', 'Programming', 'Cybersecurity', 'Web Development', 'UI/UX Design'],
            typeSpeed: 70,
            backSpeed: 40,
            backDelay: 1400,
            loop: true
        });
    }

    /* ---------- Custom cursor ---------- */
    if (finePointer && !reduceMotion) {
        const dot = $('.cursor-dot');
        const ring = $('.cursor-ring');
        let mx = -100, my = -100, rx = -100, ry = -100;
        document.addEventListener('pointermove', (e) => {
            mx = e.clientX;
            my = e.clientY;
            document.body.classList.add('has-cursor');
        });
        document.addEventListener('pointerleave', () => document.body.classList.remove('has-cursor'));
        const hoverSel = 'a, button, [data-tilt], .flip, input, textarea, .tag-sphere';
        document.addEventListener('pointerover', (e) => {
            ring.classList.toggle('hover', !!e.target.closest(hoverSel));
        });
        (function follow() {
            rx += (mx - rx) * 0.18;
            ry += (my - ry) * 0.18;
            dot.style.transform = `translate(${mx}px, ${my}px)`;
            ring.style.transform = `translate(${rx}px, ${ry}px)`;
            requestAnimationFrame(follow);
        })();
    }

    /* ---------- Scroll: progress, header, back-to-top, fab ---------- */
    const header = $('#header');
    const scrollProgress = $('#scrollProgress');
    const toTop = $('#toTop');
    const toTopProgress = $('#toTopProgress');
    const fab = $('#fab');
    const RING = 2 * Math.PI * 24;
    let lastY = window.scrollY;
    let scrollTicking = false;

    function onScroll() {
        const y = window.scrollY;
        const max = document.documentElement.scrollHeight - window.innerHeight;
        const ratio = max > 0 ? y / max : 0;
        scrollProgress.style.transform = `scaleX(${ratio})`;
        toTopProgress.style.strokeDashoffset = RING * (1 - ratio);
        header.classList.toggle('scrolled', y > 30);
        toTop.classList.toggle('show', y > 500);
        if (!popup.classList.contains('open')) {
            if (y > lastY && y > 120) fab.classList.add('hide');
            else if (y < lastY || y < 40) fab.classList.remove('hide');
        }
        lastY = y;
        scrollTicking = false;
    }
    window.addEventListener('scroll', () => {
        if (!scrollTicking) {
            requestAnimationFrame(onScroll);
            scrollTicking = true;
        }
    }, { passive: true });

    /* ---------- Navigation ---------- */
    const navbar = $('#navbar');
    const navPill = $('#navPill');
    const navLinks = $$('.navbar a');
    const menuToggle = $('#menuToggle');
    const curtain = $('#curtain');

    function movePill(link) {
        if (!link || getComputedStyle(navPill).display === 'none') return;
        navPill.style.left = link.offsetLeft + 'px';
        navPill.style.width = link.offsetWidth + 'px';
        navPill.style.opacity = '1';
    }

    function setActive(id) {
        navLinks.forEach((a) => a.classList.toggle('active', a.getAttribute('href') === '#' + id));
        movePill(navLinks.find((a) => a.classList.contains('active')));
    }

    const sectionIds = navLinks.map((a) => a.getAttribute('href').slice(1));
    const sectionObserver = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            if (entry.isIntersecting) setActive(entry.target.id);
        });
    }, { rootMargin: '-45% 0px -50% 0px' });
    sectionIds.forEach((id) => {
        const el = document.getElementById(id);
        if (el) sectionObserver.observe(el);
    });
    window.addEventListener('resize', () => movePill(navLinks.find((a) => a.classList.contains('active'))));

    function toggleMenu(force) {
        const open = typeof force === 'boolean' ? force : !document.body.classList.contains('menu-open');
        document.body.classList.toggle('menu-open', open);
        menuToggle.setAttribute('aria-expanded', String(open));
        menuToggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    }
    menuToggle.addEventListener('click', () => toggleMenu());
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            toggleMenu(false);
            closePopup();
        }
    });

    function scrollToTarget(target) {
        const offset = target.id === 'Home' ? 0 : header.offsetHeight - 4;
        const top = target.getBoundingClientRect().top + window.scrollY - offset;
        window.scrollTo({ top, behavior: 'instant' in document.documentElement.style ? 'instant' : 'auto' });
    }

    let transitioning = false;
    $$('[data-nav]').forEach((link) => {
        link.addEventListener('click', (e) => {
            const hash = link.getAttribute('href');
            if (!hash || hash.charAt(0) !== '#') return;
            const target = document.getElementById(hash.slice(1));
            if (!target) return;
            e.preventDefault();
            toggleMenu(false);
            history.replaceState(null, '', hash);

            const distance = Math.abs(target.getBoundingClientRect().top);
            if (reduceMotion || distance < window.innerHeight * 0.6) {
                window.scrollTo({ top: target.getBoundingClientRect().top + window.scrollY - (target.id === 'Home' ? 0 : header.offsetHeight - 4), behavior: reduceMotion ? 'auto' : 'smooth' });
                return;
            }
            if (transitioning) return;
            transitioning = true;
            curtain.classList.remove('reveal');
            curtain.classList.add('cover');
            setTimeout(() => {
                document.documentElement.style.scrollBehavior = 'auto';
                scrollToTarget(target);
                document.documentElement.style.scrollBehavior = '';
                curtain.classList.add('reveal');
                curtain.classList.remove('cover');
                setTimeout(() => {
                    curtain.classList.remove('reveal');
                    transitioning = false;
                }, 700);
            }, 680);
        });
    });

    /* ---------- Reveal on scroll + counters ---------- */
    function animateCount(el) {
        const end = parseInt(el.dataset.count, 10) || 0;
        const suffix = el.dataset.suffix || '';
        const dur = 1600;
        const t0 = performance.now();
        (function step(now) {
            const k = clamp((now - t0) / dur, 0, 1);
            const eased = 1 - Math.pow(1 - k, 4);
            el.textContent = Math.round(end * eased) + (k === 1 ? suffix : '');
            if (k < 1) requestAnimationFrame(step);
        })(t0);
    }

    const revealObserver = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            entry.target.classList.add('in');
            $$('[data-count]', entry.target).forEach(animateCount);
            revealObserver.unobserve(entry.target);
        });
    }, { threshold: 0.15, rootMargin: '0px 0px -60px 0px' });
    $$('[data-reveal]').forEach((el) => revealObserver.observe(el));

    /* ---------- 3D tilt ---------- */
    function bindTilt(el, strength = 12, surface = el) {
        surface.addEventListener('pointermove', (e) => {
            if (e.pointerType !== 'mouse') return;
            const r = el.getBoundingClientRect();
            const px = clamp((e.clientX - r.left) / r.width, 0, 1);
            const py = clamp((e.clientY - r.top) / r.height, 0, 1);
            el.classList.add('tilting');
            el.style.setProperty('--ry', ((px - 0.5) * strength).toFixed(2) + 'deg');
            el.style.setProperty('--rx', ((0.5 - py) * strength).toFixed(2) + 'deg');
            el.style.setProperty('--mx', (px * 100).toFixed(1) + '%');
            el.style.setProperty('--my', (py * 100).toFixed(1) + '%');
        });
        surface.addEventListener('pointerleave', () => {
            el.classList.remove('tilting');
            el.style.setProperty('--rx', '0deg');
            el.style.setProperty('--ry', '0deg');
        });
    }
    if (finePointer && !reduceMotion) {
        $$('[data-tilt]').forEach((el) => bindTilt(el, 14));
        bindTilt($('#portrait'), 22, $('#Home'));
    }

    /* ---------- Magnetic buttons ---------- */
    if (finePointer && !reduceMotion) {
        $$('[data-magnetic]').forEach((btn) => {
            btn.addEventListener('pointermove', (e) => {
                const r = btn.getBoundingClientRect();
                btn.style.setProperty('--bx', ((e.clientX - r.left - r.width / 2) * 0.25).toFixed(1) + 'px');
                btn.style.setProperty('--by', ((e.clientY - r.top - r.height / 2) * 0.35).toFixed(1) + 'px');
            });
            btn.addEventListener('pointerleave', () => {
                btn.style.setProperty('--bx', '0px');
                btn.style.setProperty('--by', '0px');
            });
        });
    }

    /* =========================================================
       HERO 3D SCENE — wireframe gears, particle globe, starfield
       (hand-rolled perspective projection on a 2D canvas)
       ========================================================= */
    (function hero3d() {
        const canvas = $('#hero3d');
        if (!canvas) return;
        let ctx, W, H;
        let mouseX = 0, mouseY = 0, camX = 0, camY = 0;

        function rotate(p, ax, ay, az) {
            let { x, y, z } = p;
            let c = Math.cos(az), s = Math.sin(az);
            [x, y] = [x * c - y * s, x * s + y * c];
            c = Math.cos(ax); s = Math.sin(ax);
            [y, z] = [y * c - z * s, y * s + z * c];
            c = Math.cos(ay); s = Math.sin(ay);
            [x, z] = [x * c + z * s, -x * s + z * c];
            return { x, y, z };
        }

        function project(p, cx, cy, fov) {
            const k = fov / (fov + p.z);
            return { x: cx + p.x * k, y: cy + p.y * k, k, z: p.z };
        }

        function makeGear(teeth, rIn, rOut, depth) {
            const outline = [];
            const step = (Math.PI * 2) / teeth;
            for (let i = 0; i < teeth; i++) {
                const a = i * step;
                outline.push([a, rIn], [a + step * 0.12, rOut], [a + step * 0.43, rOut], [a + step * 0.55, rIn]);
            }
            const toPt = ([a, r], z) => ({ x: Math.cos(a) * r, y: Math.sin(a) * r, z });
            const front = outline.map((o) => toPt(o, -depth / 2));
            const back = outline.map((o) => toPt(o, depth / 2));
            const hub = [];
            for (let i = 0; i < 36; i++) hub.push({ a: (i / 36) * Math.PI * 2 });
            return { front, back, hub, rIn, depth };
        }

        const gears = [
            { g: makeGear(18, 0.82, 1, 0.16), color: '0,238,255', spin: 0.25 },
            { g: makeGear(12, 0.76, 1, 0.2), color: '124,92,255', spin: -0.375 },
            { g: makeGear(10, 0.72, 1, 0.22), color: '255,62,165', spin: 0.45 }
        ];

        const globe = [];
        const N = 420;
        const golden = Math.PI * (3 - Math.sqrt(5));
        for (let i = 0; i < N; i++) {
            const y = 1 - (i / (N - 1)) * 2;
            const r = Math.sqrt(1 - y * y);
            const th = golden * i;
            globe.push({ x: Math.cos(th) * r, y, z: Math.sin(th) * r });
        }

        const stars = Array.from({ length: 140 }, () => ({
            x: (Math.random() - 0.5) * 2,
            y: (Math.random() - 0.5) * 2,
            z: Math.random()
        }));

        function resize() {
            ({ ctx, w: W, h: H } = fitCanvas(canvas));
        }
        resize();
        window.addEventListener('resize', resize);

        $('#Home').addEventListener('pointermove', (e) => {
            mouseX = e.clientX / window.innerWidth - 0.5;
            mouseY = e.clientY / window.innerHeight - 0.5;
        });

        function drawGear(entry, cx, cy, scale, t, tiltX, tiltY) {
            const { g, color, spin } = entry;
            const az = t * spin;
            const fov = scale * 4;
            const tr = (p) => {
                const r = rotate({ x: p.x * scale, y: p.y * scale, z: p.z * scale }, tiltX, tiltY, az);
                return project(r, cx, cy, fov);
            };
            const F = g.front.map(tr);
            const B = g.back.map(tr);

            ctx.lineWidth = 1;
            ctx.strokeStyle = `rgba(${color},0.18)`;
            ctx.beginPath();
            B.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
            ctx.closePath();
            ctx.stroke();

            ctx.strokeStyle = `rgba(${color},0.12)`;
            ctx.beginPath();
            for (let i = 0; i < F.length; i += 2) {
                ctx.moveTo(F[i].x, F[i].y);
                ctx.lineTo(B[i].x, B[i].y);
            }
            ctx.stroke();

            ctx.strokeStyle = `rgba(${color},0.55)`;
            ctx.lineWidth = 1.3;
            ctx.shadowColor = `rgba(${color},0.8)`;
            ctx.shadowBlur = 8;
            ctx.beginPath();
            F.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
            ctx.closePath();
            ctx.stroke();
            ctx.shadowBlur = 0;

            // hub rings + spokes
            const ringAt = (rad, z, alpha) => {
                ctx.strokeStyle = `rgba(${color},${alpha})`;
                ctx.beginPath();
                g.hub.forEach((h, i) => {
                    const p = tr({ x: Math.cos(h.a) * rad, y: Math.sin(h.a) * rad, z });
                    i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y);
                });
                ctx.closePath();
                ctx.stroke();
            };
            ctx.lineWidth = 1;
            ringAt(0.22, -g.depth / 2, 0.5);
            ringAt(0.22, g.depth / 2, 0.2);
            ringAt(0.6, -g.depth / 2, 0.3);
            ctx.strokeStyle = `rgba(${color},0.3)`;
            ctx.beginPath();
            for (let i = 0; i < 6; i++) {
                const a = (i / 6) * Math.PI * 2;
                const p1 = tr({ x: Math.cos(a) * 0.22, y: Math.sin(a) * 0.22, z: -g.depth / 2 });
                const p2 = tr({ x: Math.cos(a) * 0.6, y: Math.sin(a) * 0.6, z: -g.depth / 2 });
                ctx.moveTo(p1.x, p1.y);
                ctx.lineTo(p2.x, p2.y);
            }
            ctx.stroke();
        }

        function frame(now) {
            const t = reduceMotion ? 0 : now / 1000;
            camX += (mouseX - camX) * 0.05;
            camY += (mouseY - camY) * 0.05;
            ctx.clearRect(0, 0, W, H);

            const wide = W > 1080;
            const base = Math.min(W, H);

            // starfield (moving toward the camera)
            ctx.fillStyle = '#cfe9ff';
            stars.forEach((s) => {
                if (!reduceMotion) {
                    s.z -= 0.0016;
                    if (s.z <= 0.02) {
                        s.z = 1;
                        s.x = (Math.random() - 0.5) * 2;
                        s.y = (Math.random() - 0.5) * 2;
                    }
                }
                const k = 0.35 / s.z;
                const x = W / 2 + (s.x - camX * 0.3) * k * W * 0.5;
                const y = H / 2 + (s.y - camY * 0.3) * k * H * 0.5;
                if (x < 0 || x > W || y < 0 || y > H) return;
                ctx.globalAlpha = clamp((1 - s.z) * 0.9, 0, 0.9);
                const size = clamp((1 - s.z) * 2.2, 0.4, 2.2);
                ctx.fillRect(x, y, size, size);
            });
            ctx.globalAlpha = 1;

            // particle globe behind the portrait
            const gx = wide ? W * 0.73 : W * 0.5;
            const gy = wide ? H * 0.5 : H * 0.3;
            const gr = wide ? base * 0.42 : base * 0.46;
            const ay = t * 0.18 + camX * 1.2;
            const ax = -0.35 + camY * 0.8;
            globe.forEach((p) => {
                const r = rotate({ x: p.x * gr, y: p.y * gr, z: p.z * gr }, ax, ay, 0);
                const q = project(r, gx, gy, gr * 3);
                const depth = (r.z / gr + 1) / 2; // 0 front .. 1 back
                const alpha = 0.08 + (1 - depth) * 0.5;
                const size = 0.6 + (1 - depth) * 1.8;
                const mix = (p.y + 1) / 2;
                const R = Math.round(0 + 124 * mix), G = Math.round(238 - 146 * mix), Bc = 255;
                ctx.fillStyle = `rgba(${R},${G},${Bc},${alpha})`;
                ctx.beginPath();
                ctx.arc(q.x, q.y, size * q.k, 0, Math.PI * 2);
                ctx.fill();
            });

            // meshing gears
            const tiltX = 0.9 + camY * 0.6;
            const tiltY = -0.5 + camX * 0.8;
            if (wide) {
                const s1 = base * 0.26;
                drawGear(gears[0], W * 0.1, H * 0.86, s1, t, tiltX, tiltY);
                drawGear(gears[1], W * 0.1 + s1 * 1.55, H * 0.86 - s1 * 0.55, s1 * 0.66, t, tiltX, tiltY);
                drawGear(gears[2], W * 0.95, H * 0.14, base * 0.14, t, -0.6 + camY * 0.6, 0.5 + camX * 0.8);
            } else {
                const s1 = base * 0.34;
                drawGear(gears[0], W * 0.02, H * 0.94, s1, t, tiltX, tiltY);
                drawGear(gears[2], W * 0.98, H * 0.1, base * 0.18, t, -0.6 + camY * 0.6, 0.5 + camX * 0.8);
            }
        }

        if (reduceMotion) {
            frame(0);
            window.addEventListener('resize', () => frame(0));
        } else {
            loopWhileVisible(canvas, frame);
        }
    })();

    /* =========================================================
       LIVE SHOW — terminal, clock, session, wave
       ========================================================= */
    (function liveShow() {
        // ---- Live coding terminal ----
        const term = $('#terminal');
        const script = [
            [['c', '# studio.py — live session']],
            [['k', 'from'], ['', ' nayon '], ['k', 'import'], ['', ' Engineer, Developer']],
            [],
            [['k', 'class'], ['f', ' AHNayon'], ['', '(Engineer, Developer):']],
            [['', '    location = '], ['s', '"Sundarganj, Bangladesh"']],
            [['', '    stack    = ['], ['s', '"Python"'], ['', ', '], ['s', '"Java"'], ['', ', '], ['s', '"SQL"'], ['', ', '], ['s', '"JS"'], ['', ']']],
            [['', '    focus    = ['], ['s', '"Web Dev"'], ['', ', '], ['s', '"Cybersecurity"'], ['', ']']],
            [],
            [['', '    '], ['k', 'def'], ['f', ' build'], ['', '(self, idea):']],
            [['', '        design = self.'], ['f', 'engineer'], ['', '(idea)']],
            [['', '        '], ['k', 'return'], ['', ' self.'], ['f', 'ship'], ['', '(design, quality='], ['n', '100'], ['', ')']],
            [],
            [['', 'nayon = '], ['f', 'AHNayon'], ['', '()']],
            [['', 'nayon.'], ['f', 'build'], ['', '('], ['s', '"your next big project"'], ['', ')']],
            [['c', '>>> '], ['s', '✔ Deployed successfully 🚀']]
        ];
        const caret = document.createElement('span');
        caret.className = 'term-caret';
        let li = 0, ti = 0, ci = 0, current = null, timer = 0, active = false;

        function resetTerm() {
            term.textContent = '';
            term.appendChild(caret);
            li = ti = ci = 0;
            current = null;
        }

        function typeStep() {
            if (!active) { timer = 0; return; }
            if (li >= script.length) {
                timer = setTimeout(() => { resetTerm(); typeStep(); }, 3800);
                return;
            }
            const line = script[li];
            if (ti >= line.length) {
                term.insertBefore(document.createTextNode('\n'), caret);
                li++; ti = 0; ci = 0; current = null;
                timer = setTimeout(typeStep, 140);
                return;
            }
            const [cls, text] = line[ti];
            if (!current) {
                current = document.createElement('span');
                if (cls) current.className = cls;
                term.insertBefore(current, caret);
            }
            current.textContent += text[ci++];
            if (ci >= text.length) { ti++; ci = 0; current = null; }
            timer = setTimeout(typeStep, 18 + Math.random() * 40);
        }

        if (term) {
            resetTerm();
            if (reduceMotion) {
                script.forEach((line) => {
                    line.forEach(([cls, text]) => {
                        const s = document.createElement('span');
                        if (cls) s.className = cls;
                        s.textContent = text;
                        term.insertBefore(s, caret);
                    });
                    term.insertBefore(document.createTextNode('\n'), caret);
                });
            } else {
                new IntersectionObserver((entries) => {
                    active = entries[0].isIntersecting;
                    if (active && !timer) typeStep();
                }).observe(term);
            }
        }

        // ---- Clock (Asia/Dhaka) ----
        const clock = $('#clock');
        const clockMeta = $('#clockMeta');
        const workStatus = $('#workStatus');
        const sessionTime = $('#sessionTime');
        const sessionStart = Date.now();
        const timeFmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Dhaka', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
        const dateFmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Dhaka', weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' });
        const partsFmt = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Dhaka', weekday: 'short', hour: 'numeric', hour12: false });

        function updateClock() {
            const now = new Date();
            const [h, m, s] = timeFmt.format(now).split(':');
            clock.innerHTML = `${h}:${m}<span class="sec">:${s}</span>`;
            clockMeta.textContent = `${dateFmt.format(now)} · GMT+6`;
            const parts = partsFmt.formatToParts(now);
            const wd = parts.find((p) => p.type === 'weekday').value;
            const hr = parseInt(parts.find((p) => p.type === 'hour').value, 10) % 24;
            const working = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].includes(wd) && hr >= 9 && hr < 18;
            workStatus.textContent = working ? '🟢 Working' : '🌙 Off-hours';
            const secs = Math.floor((Date.now() - sessionStart) / 1000);
            sessionTime.textContent = `${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`;
        }
        if (clock) {
            updateClock();
            setInterval(updateClock, 1000);
        }

        // ---- Now building rotator ----
        const nowPlaying = $('#nowPlaying');
        const building = ['AI Resume Analyzer', 'Blockchain Voting', 'Smart Inventory', 'This portfolio ✨'];
        let bi = 0;
        if (nowPlaying && !reduceMotion) {
            setInterval(() => {
                nowPlaying.style.opacity = '0';
                setTimeout(() => {
                    bi = (bi + 1) % building.length;
                    nowPlaying.textContent = building[bi];
                    nowPlaying.style.opacity = '1';
                }, 300);
            }, 3200);
        }

        // ---- Signal wave ----
        const wave = $('#waveCanvas');
        if (wave) {
            let ctx, W, H;
            const resize = () => ({ ctx, w: W, h: H } = fitCanvas(wave));
            resize();
            window.addEventListener('resize', resize);
            const layers = [
                { amp: 0.32, freq: 1.6, speed: 1.4, color: 'rgba(0,238,255,0.9)' },
                { amp: 0.22, freq: 2.4, speed: -1.1, color: 'rgba(124,92,255,0.7)' },
                { amp: 0.16, freq: 3.6, speed: 2.0, color: 'rgba(255,62,165,0.6)' }
            ];
            const draw = (now) => {
                const t = now / 1000;
                ctx.clearRect(0, 0, W, H);
                layers.forEach((L) => {
                    ctx.strokeStyle = L.color;
                    ctx.lineWidth = 1.6;
                    ctx.beginPath();
                    for (let x = 0; x <= W; x += 3) {
                        const u = x / W;
                        const env = Math.sin(u * Math.PI);
                        const pulse = 0.65 + 0.35 * Math.sin(t * 1.3 + L.freq);
                        const y = H / 2 + Math.sin(u * Math.PI * 2 * L.freq + t * L.speed) * H * L.amp * env * pulse;
                        x ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
                    }
                    ctx.stroke();
                });
            };
            if (reduceMotion) draw(0);
            else loopWhileVisible(wave, draw);
        }
    })();

    /* =========================================================
       SKILLS — 3D tag sphere + ring cards
       ========================================================= */
    (function tagSphere() {
        const host = $('#tagSphere');
        if (!host) return;
        const items = [...techSkills, ...profSkills];
        const golden = Math.PI * (3 - Math.sqrt(5));
        const nodes = items.map((s, i) => {
            const y = 1 - (i / (items.length - 1)) * 2;
            const r = Math.sqrt(1 - y * y);
            const th = golden * i;
            const el = document.createElement('span');
            el.innerHTML = `<i class="${s.icon}"></i>${s.name}`;
            host.appendChild(el);
            return { el, x: Math.cos(th) * r, y, z: Math.sin(th) * r };
        });

        let vx = 0.004, vy = 0.006;
        const baseVX = 0.002, baseVY = 0.004;
        let dragging = false, lx = 0, ly = 0;

        host.addEventListener('pointerdown', (e) => {
            dragging = true;
            lx = e.clientX; ly = e.clientY;
            host.setPointerCapture(e.pointerId);
        });
        host.addEventListener('pointermove', (e) => {
            if (!dragging) return;
            vy = (e.clientX - lx) * 0.0025;
            vx = -(e.clientY - ly) * 0.0025;
            lx = e.clientX; ly = e.clientY;
        });
        const end = () => { dragging = false; };
        host.addEventListener('pointerup', end);
        host.addEventListener('pointercancel', end);

        function frame() {
            if (!dragging) {
                vx += (baseVX - vx) * 0.02;
                vy += (baseVY - vy) * 0.02;
            }
            const R = host.clientWidth * 0.38;
            const cx = Math.cos(vx), sx = Math.sin(vx), cy = Math.cos(vy), sy = Math.sin(vy);
            nodes.forEach((n) => {
                let y = n.y * cx - n.z * sx;
                let z = n.y * sx + n.z * cx;
                let x = n.x * cy + z * sy;
                z = -n.x * sy + z * cy;
                n.x = x; n.y = y; n.z = z;
                const k = 0.78 + (1 - z) * 0.2;
                const alpha = clamp(0.2 + (1 - z) * 0.4, 0.15, 1);
                n.el.style.transform = `translate(-50%, -50%) translate3d(${(x * R).toFixed(1)}px, ${(y * R).toFixed(1)}px, 0) scale(${k.toFixed(3)})`;
                n.el.style.opacity = alpha.toFixed(2);
                n.el.style.zIndex = String(Math.round((1 - z) * 100));
                n.el.style.borderColor = z < -0.3 ? 'rgba(0,238,255,.55)' : '';
            });
        }
        if (reduceMotion) {
            vx = vy = 0;
            frame();
        } else {
            loopWhileVisible(host, frame);
        }
    })();

    (function skillCards() {
        const grid = $('#skillsGrid');
        const tabs = $('#skillTabs');
        if (!grid || !tabs) return;
        const C = 2 * Math.PI * 34;
        let seen = false;

        function render(list) {
            grid.innerHTML = list.map((s, i) => `
                <div class="skill-card glass" style="--i:${i}">
                    <div class="ring">
                        <svg viewBox="0 0 80 80" aria-hidden="true"><circle class="track" cx="40" cy="40" r="34"/><circle class="bar" cx="40" cy="40" r="34" data-p="${s.percent}"/></svg>
                        <i class="${s.icon}"></i>
                    </div>
                    <h4>${s.name}</h4>
                    <small data-to="${s.percent}">0%</small>
                </div>`).join('');
            if (seen) fill();
        }

        function fill() {
            requestAnimationFrame(() => requestAnimationFrame(() => {
                $$('.bar', grid).forEach((c) => {
                    c.style.strokeDashoffset = (C * (1 - c.dataset.p / 100)).toFixed(1);
                });
                $$('small[data-to]', grid).forEach((el, i) => {
                    const to = +el.dataset.to;
                    const t0 = performance.now() + i * 70 + 200;
                    (function step(now) {
                        const k = clamp((now - t0) / 1400, 0, 1);
                        el.textContent = Math.round(to * (1 - Math.pow(1 - k, 3))) + '%';
                        if (k < 1) requestAnimationFrame(step);
                    })(performance.now());
                });
            }));
        }

        new IntersectionObserver((entries, obs) => {
            if (entries[0].isIntersecting) {
                seen = true;
                fill();
                obs.disconnect();
            }
        }, { threshold: 0.2 }).observe(grid);

        setupTabs(tabs, (key) => render(key === 'prof' ? profSkills : techSkills));
        render(techSkills);
    })();

    /* Pill-style tab group */
    function setupTabs(group, onChange) {
        const pill = $('.tab-pill', group);
        const buttons = $$('.tab', group);
        const place = (btn) => {
            pill.style.left = btn.offsetLeft + 'px';
            pill.style.width = btn.offsetWidth + 'px';
        };
        buttons.forEach((btn) => {
            btn.addEventListener('click', () => {
                buttons.forEach((b) => {
                    b.classList.toggle('active', b === btn);
                    b.setAttribute('aria-selected', String(b === btn));
                });
                place(btn);
                onChange(btn.dataset.tab);
            });
        });
        const init = () => place(buttons.find((b) => b.classList.contains('active')) || buttons[0]);
        init();
        window.addEventListener('resize', init);
        if (document.fonts && document.fonts.ready) document.fonts.ready.then(init);
        return init;
    }

    /* ---------- Services: tap to flip on touch ---------- */
    $$('.flip').forEach((card) => {
        card.addEventListener('click', (e) => {
            if (finePointer || e.target.closest('a')) return;
            card.classList.toggle('flipped');
        });
        card.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && e.target === card) card.classList.toggle('flipped');
        });
    });

    /* ---------- Contact form → mailto ---------- */
    const form = $('#contactForm');
    if (form) {
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            const name = $('#fName').value.trim();
            const email = $('#fEmail').value.trim();
            const subject = $('#fSubject').value.trim() || 'Project inquiry from portfolio';
            const msg = $('#fMsg').value.trim();
            const note = $('#formNote');
            if (!name || !email || !msg || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                note.style.color = '#ff7eb6';
                note.textContent = 'Please fill in your name, a valid email and a message.';
                return;
            }
            const body = `${msg}\n\n— ${name} (${email})`;
            window.location.href = `mailto:mdnayon718@gmail.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
            note.style.color = '';
            note.textContent = 'Opening your email app… Thank you! 🚀';
        });
    }

    /* ---------- Premium Area popup ---------- */
    const popup = $('#popup');
    const linksList = $('#linksList');

    function renderLinks(key) {
        const set = linkSets[key];
        linksList.innerHTML = '';
        set.urls.forEach((raw, i) => {
            const clean = raw.trim();
            const a = document.createElement('a');
            a.className = 'link-item';
            a.href = /^https?:\/\//.test(clean) ? clean : 'https://' + clean;
            a.target = '_blank';
            a.rel = 'noopener noreferrer';
            a.style.setProperty('--i', i);
            a.innerHTML = '<i class="bx bx-link-external"></i><span></span><small></small>';
            a.querySelector('span').textContent = clean;
            a.querySelector('small').textContent = set.label;
            linksList.appendChild(a);
        });
    }

    const placeLinkTabs = setupTabs($('#linkTabs'), renderLinks);
    renderLinks('myown');

    function openPopup() {
        popup.classList.add('open');
        fab.setAttribute('aria-expanded', 'true');
        placeLinkTabs();
    }
    function closePopup() {
        popup.classList.remove('open');
        fab.setAttribute('aria-expanded', 'false');
    }
    fab.addEventListener('click', (e) => {
        e.stopPropagation();
        popup.classList.contains('open') ? closePopup() : openPopup();
    });
    $('#popupClose').addEventListener('click', closePopup);
    document.addEventListener('click', (e) => {
        if (popup.classList.contains('open') && !popup.contains(e.target) && !fab.contains(e.target)) closePopup();
    });

    /* ---------- Misc ---------- */
    const year = $('#year');
    if (year) year.textContent = new Date().getFullYear();
    onScroll();
})();
