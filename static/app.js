(function () {
    'use strict';

    var M = window.__METRICS__;
    var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var isDesktop = function () { return window.innerWidth >= 880; };
    var clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };
    var smooth = function (t) { return t * t * (3 - 2 * t); };
    var $ = function (id) { return document.getElementById(id); };

    /* ------------------------------------------------------------
       1. PAGE UI (works even if 3D fails)
    ------------------------------------------------------------ */
    var scenes = Array.prototype.slice.call(document.querySelectorAll('[data-scene]'));

    // reveal on scroll
    var revealObs = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
            if (e.isIntersecting) { e.target.classList.add('in'); revealObs.unobserve(e.target); }
        });
    }, { threshold: 0.15 });
    document.querySelectorAll('.reveal').forEach(function (el) { revealObs.observe(el); });

    // number counters
    function animateNumber(el, to, dec, suffix, ms) {
        if (reduce) { el.textContent = to.toFixed(dec) + suffix; return; }
        var start = performance.now();
        (function tick(now) {
            var t = clamp((now - start) / ms, 0, 1);
            var e = 1 - Math.pow(1 - t, 3);
            el.textContent = (to * e).toFixed(dec) + suffix;
            if (t < 1) requestAnimationFrame(tick);
        })(start);
    }
    var countObs = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
            if (!e.isIntersecting) return;
            var el = e.target;
            animateNumber(el, parseFloat(el.dataset.count), parseInt(el.dataset.dec || '0', 10), el.dataset.suffix || '', 1400);
            countObs.unobserve(el);
        });
    }, { threshold: 0.4 });
    document.querySelectorAll('[data-count]').forEach(function (el) { countObs.observe(el); });

    // feature importance bars
    (function buildBars() {
        var box = $('bars');
        var imp = M.xgb.feature_importance;
        var keys = Object.keys(imp).sort(function (a, b) { return imp[b] - imp[a]; });
        var max = imp[keys[0]];
        keys.forEach(function (k) {
            var row = document.createElement('div');
            row.className = 'bar';
            row.innerHTML = '<span>' + k.replace(/([A-Z])/g, ' $1').trim() + '</span>' +
                '<div class="track"><div class="fill" data-w="' + (imp[k] / max * 100).toFixed(1) + '"></div></div>' +
                '<span>' + (imp[k] * 100).toFixed(1) + '%</span>';
            box.appendChild(row);
        });
        var obs = new IntersectionObserver(function (entries) {
            if (entries[0].isIntersecting) {
                box.querySelectorAll('.fill').forEach(function (f, i) {
                    setTimeout(function () { f.style.width = f.dataset.w + '%'; }, reduce ? 0 : i * 70);
                });
                obs.disconnect();
            }
        }, { threshold: 0.3 });
        obs.observe(box);
    })();

    // side dots
    var dotsBox = $('dots');
    var dotBtns = scenes.map(function (s, i) {
        var b = document.createElement('button');
        b.setAttribute('aria-label', s.dataset.name);
        b.dataset.label = s.dataset.name;
        b.addEventListener('click', function () { s.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' }); });
        dotsBox.appendChild(b);
        return b;
    });

    // slider read-outs
    [['age', 'age-val'], ['yearsAtCompany', 'years-val'], ['distanceFromHome', 'distance-val']].forEach(function (p) {
        $(p[0]).addEventListener('input', function (e) { $(p[1]).textContent = e.target.value; });
    });

    /* ------------------------------------------------------------
       2. SCROLL STATE
    ------------------------------------------------------------ */
    var centers = [];
    function measure() {
        centers = scenes.map(function (s) { return s.offsetTop + s.offsetHeight / 2; });
    }
    function sceneFloat() {
        var y = window.scrollY + window.innerHeight / 2;
        var n = centers.length;
        if (y <= centers[0]) return 0;
        if (y >= centers[n - 1]) return n - 1;
        var i = 0;
        for (var k = 0; k < n - 1; k++) { if (y >= centers[k]) i = k; }
        return i + (y - centers[i]) / (centers[i + 1] - centers[i]);
    }
    function onScroll() {
        var max = document.documentElement.scrollHeight - window.innerHeight;
        $('progress').style.width = (max > 0 ? window.scrollY / max * 100 : 0) + '%';
        var cur = Math.round(sceneFloat());
        dotBtns.forEach(function (b, i) { b.classList.toggle('on', i === cur); });
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('load', function () { measure(); onScroll(); });
    window.addEventListener('resize', function () { measure(); onScroll(); });
    measure(); onScroll();

    /* ------------------------------------------------------------
       3. 3D SCENE
    ------------------------------------------------------------ */
    var three = null;   // filled when WebGL works

    function toVec(sat, wlb, inc, yrs, jitter) {
        var j = function () { return jitter ? (Math.random() + Math.random() - 1) : 0; };
        return new THREE.Vector3(
            ((sat + wlb) / 2 - 2.5) * 3.2 + j() * 0.9,
            (inc - 82500) / 67500 * 4.5 + j() * 0.5,
            (yrs - 12) / 12 * 5 + j() * 0.5
        );
    }

    function initThree() {
        if (typeof THREE === 'undefined') throw new Error('Three.js not loaded');
        var canvas = $('bg');
        var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.setClearColor(0x000000, 0);

        var scene = new THREE.Scene();
        scene.fog = new THREE.FogExp2(0x05060a, 0.03);
        var camera = new THREE.PerspectiveCamera(55, 1, 0.1, 300);
        var world = new THREE.Group();
        scene.add(world);

        // soft round sprite for every particle
        var c = document.createElement('canvas');
        c.width = c.height = 64;
        var g = c.getContext('2d');
        var grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
        grad.addColorStop(0, 'rgba(255,255,255,1)');
        grad.addColorStop(0.35, 'rgba(255,255,255,0.75)');
        grad.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
        var sprite = new THREE.CanvasTexture(c);

        // distant stars
        var sp = new Float32Array(600 * 3);
        for (var s = 0; s < 600; s++) {
            var r = 45 + Math.random() * 60, th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
            sp[s * 3] = r * Math.sin(ph) * Math.cos(th);
            sp[s * 3 + 1] = r * Math.sin(ph) * Math.sin(th);
            sp[s * 3 + 2] = r * Math.cos(ph);
        }
        var starGeo = new THREE.BufferGeometry();
        starGeo.setAttribute('position', new THREE.BufferAttribute(sp, 3));
        scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({
            size: 0.5, map: sprite, color: 0x8a93c9, transparent: true, opacity: 0.55,
            depthWrite: false, blending: THREE.AdditiveBlending
        })));

        // marker for the predicted employee
        var marker = new THREE.Group();
        var coreMat = new THREE.MeshBasicMaterial({ color: 0x2ee6a6 });
        var haloMat = new THREE.MeshBasicMaterial({ color: 0x2ee6a6, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false });
        var ringMat = new THREE.MeshBasicMaterial({ color: 0x2ee6a6, transparent: true, opacity: 0.8 });
        var core = new THREE.Mesh(new THREE.SphereGeometry(0.24, 24, 24), coreMat);
        var halo = new THREE.Mesh(new THREE.SphereGeometry(0.6, 24, 24), haloMat);
        var ring1 = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.015, 8, 80), ringMat);
        var ring2 = new THREE.Mesh(new THREE.TorusGeometry(1.25, 0.01, 8, 80), ringMat);
        ring2.rotation.x = Math.PI / 2.6;
        marker.add(core, halo, ring1, ring2);
        marker.scale.setScalar(0.0001);
        marker.visible = false;
        world.add(marker);

        // lines from the marker to its nearest employees
        var linkGeo = new THREE.BufferGeometry();
        linkGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6 * 2 * 3), 3));
        var linkMat = new THREE.LineBasicMaterial({ color: 0x2ee6a6, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending });
        var links = new THREE.LineSegments(linkGeo, linkMat);
        links.visible = false;
        world.add(links);

        return { renderer: renderer, scene: scene, camera: camera, world: world, sprite: sprite,
                 marker: marker, core: core, halo: halo, ring1: ring1, ring2: ring2,
                 coreMat: coreMat, haloMat: haloMat, ringMat: ringMat, links: links, linkMat: linkMat,
                 positions: [], labels: [] };
    }

    function buildCloud(T, rows) {
        var n = rows.length;
        var pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
        var stay = 0, left = 0;
        rows.forEach(function (r, i) {
            var v = toVec(r[0], r[1], r[2], r[3], true);
            pos[i * 3] = v.x; pos[i * 3 + 1] = v.y; pos[i * 3 + 2] = v.z;
            T.positions.push(v); T.labels.push(r[4]);
            var b = 0.75 + Math.random() * 0.25;
            if (r[4] === 1) { left++; col[i * 3] = 1.0 * b; col[i * 3 + 1] = 0.36 * b; col[i * 3 + 2] = 0.45 * b; }
            else { stay++; col[i * 3] = 0.18 * b; col[i * 3 + 1] = 0.9 * b; col[i * 3 + 2] = 0.65 * b; }
        });
        var geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
        T.world.add(new THREE.Points(geo, new THREE.PointsMaterial({
            size: 0.5, map: T.sprite, vertexColors: true, transparent: true,
            depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true
        })));

        // neural-network style links between close neighbours
        var seen = {}, seg = [];
        for (var i = 0; i < n; i++) {
            var d = [];
            for (var j = 0; j < n; j++) { if (i !== j) d.push([T.positions[i].distanceTo(T.positions[j]), j]); }
            d.sort(function (a, b) { return a[0] - b[0]; });
            for (var k = 0; k < 2; k++) {
                if (d[k][0] > 2.2) continue;
                var a = Math.min(i, d[k][1]), b2 = Math.max(i, d[k][1]), key = a + '-' + b2;
                if (seen[key]) continue;
                seen[key] = 1;
                seg.push(T.positions[a].x, T.positions[a].y, T.positions[a].z, T.positions[b2].x, T.positions[b2].y, T.positions[b2].z);
            }
        }
        var lg = new THREE.BufferGeometry();
        lg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(seg), 3));
        T.world.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({
            color: 0x6d7cff, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false
        })));

        $('hud-nodes').textContent = n;
        $('hud-stay').textContent = stay;
        $('hud-left').textContent = left;
    }

    function fallbackRows() {
        var rows = [];
        for (var i = 0; i < 300; i++) {
            var sat = 1 + Math.floor(Math.random() * 4), wlb = 1 + Math.floor(Math.random() * 4);
            rows.push([sat, wlb, 15000 + Math.random() * 135000, Math.floor(Math.random() * 25),
                       ((sat + wlb) / 2 + (Math.random() - 0.5) * 1.6) < 2.4 ? 1 : 0]);
        }
        return rows;
    }

    // camera path, one keyframe per section. sx shifts the framing sideways on desktop
    var KEYS = [
        { p: [0, 0.5, 15],   l: [0, 0, 0],      sx: -3.6 },   // hero
        { p: [1.5, 0.5, 3.5], l: [-6, 0, -8],   sx: 0 },      // problem: fly inside the cloud
        { p: [0, -1, 10.5],  l: [0, 0, 0],      sx: -4 },     // data
        { p: [-7, 4, 17],    l: [0, 0, 0],      sx: 0 },      // models
        { p: [0, 0, 11],     l: [0, 0, 0],      sx: -3.8 }    // predict
    ];
    function keyAt(f) {
        var N = KEYS.length;
        f = clamp(f, 0, N - 1);
        var a = Math.floor(f), b = Math.min(a + 1, N - 1), t = smooth(f - a);
        var S = isDesktop() ? 1 : 0;
        var pa = KEYS[a], pb = KEYS[b];
        var p = new THREE.Vector3(
            pa.p[0] + pa.sx * S + ((pb.p[0] + pb.sx * S) - (pa.p[0] + pa.sx * S)) * t,
            pa.p[1] + (pb.p[1] - pa.p[1]) * t,
            pa.p[2] + (pb.p[2] - pa.p[2]) * t);
        var l = new THREE.Vector3(
            pa.l[0] + pa.sx * S + ((pb.l[0] + pb.sx * S) - (pa.l[0] + pa.sx * S)) * t,
            pa.l[1] + (pb.l[1] - pa.l[1]) * t,
            pa.l[2] + (pb.l[2] - pa.l[2]) * t);
        return { p: p, l: l };
    }

    function runLoop(T) {
        var camPos = new THREE.Vector3(), camLook = new THREE.Vector3();
        var k0 = keyAt(0); camPos.copy(k0.p); camLook.copy(k0.l);
        var mx = 0, my = 0, smx = 0, smy = 0, rot = 0, last = performance.now(), time = 0;
        var tmp = new THREE.Vector3();

        window.addEventListener('pointermove', function (e) {
            mx = e.clientX / window.innerWidth * 2 - 1;
            my = e.clientY / window.innerHeight * 2 - 1;
        });
        function resize() {
            T.renderer.setSize(window.innerWidth, window.innerHeight, false);
            T.camera.aspect = window.innerWidth / window.innerHeight;
            T.camera.updateProjectionMatrix();
        }
        window.addEventListener('resize', resize);
        resize();

        T.markerActive = false; T.markerTarget = 0;

        (function frame(now) {
            requestAnimationFrame(frame);
            var dt = Math.min((now - last) / 1000, 0.05); last = now; time += dt;
            var f = sceneFloat();
            var N = KEYS.length;
            var alpha = reduce ? 1 : 1 - Math.exp(-dt * 3.2);

            var k = keyAt(f);
            var inPredict = f > N - 1.6;

            if (T.markerActive && inPredict) {
                var blend = smooth(clamp((f - (N - 2.4)) / 1.2, 0, 1));
                T.marker.getWorldPosition(tmp);
                var S = isDesktop() ? 1 : 0;
                var mp = tmp.clone().add(new THREE.Vector3(-3.4 * S, 0.8, 7.5));
                var ml = tmp.clone().add(new THREE.Vector3(-3.4 * S, 0, 0));
                k.p.lerp(mp, blend); k.l.lerp(ml, blend);
            }

            camPos.lerp(k.p, alpha);
            camLook.lerp(k.l, alpha);

            smx += (mx - smx) * alpha * 0.6; smy += (my - smy) * alpha * 0.6;
            T.camera.position.set(camPos.x + smx * 0.7, camPos.y - smy * 0.5, camPos.z);
            T.camera.lookAt(camLook);

            var rotTarget = (reduce || (T.markerActive && inPredict)) ? 0 : 0.05;
            rot += (rotTarget - rot) * (1 - Math.exp(-dt * 2));
            T.world.rotation.y += rot * dt * 3;
            T.world.rotation.x = Math.sin(f * 0.7) * 0.12;

            // marker animation
            if (T.marker.visible) {
                var s = T.marker.scale.x + (T.markerTarget - T.marker.scale.x) * (1 - Math.exp(-dt * 5));
                T.marker.scale.setScalar(Math.max(s, 0.0001));
                T.halo.scale.setScalar(1 + 0.16 * Math.sin(time * 3));
                T.ring1.rotation.z += dt * 0.9;
                T.ring2.rotation.y += dt * 0.6;
            }

            T.renderer.render(T.scene, T.camera);
        })(performance.now());
    }

    try {
        three = initThree();
        fetch('/points').then(function (r) { return r.json(); })
            .catch(function () { return fallbackRows(); })
            .then(function (rows) { buildCloud(three, rows && rows.length ? rows : fallbackRows()); });
        runLoop(three);
    } catch (err) {
        console.warn('3D disabled:', err);
        document.body.classList.add('no-webgl');
        three = null;
    }

    /* ------------------------------------------------------------
       4. PREDICTION
    ------------------------------------------------------------ */
    function placeMarker(vals, prediction) {
        if (!three) return;
        var T = three;
        var colorHex = prediction === 1 ? 0xff5d73 : 0x2ee6a6;
        T.coreMat.color.setHex(colorHex); T.haloMat.color.setHex(colorHex);
        T.ringMat.color.setHex(colorHex); T.linkMat.color.setHex(colorHex);

        var v = toVec(vals.sat, vals.wlb, vals.inc, vals.yrs, false);
        T.marker.position.copy(v);
        T.marker.visible = true;
        T.marker.scale.setScalar(0.0001);
        T.markerTarget = 1;
        T.markerActive = true;

        // nearest employees in the map
        var d = T.positions.map(function (p, i) { return [p.distanceTo(v), i]; });
        d.sort(function (a, b) { return a[0] - b[0]; });
        var near = d.slice(0, 6);
        var arr = T.links.geometry.attributes.position.array;
        near.forEach(function (n, i) {
            var p = T.positions[n[1]];
            arr[i * 6] = v.x; arr[i * 6 + 1] = v.y; arr[i * 6 + 2] = v.z;
            arr[i * 6 + 3] = p.x; arr[i * 6 + 4] = p.y; arr[i * 6 + 5] = p.z;
        });
        T.links.geometry.attributes.position.needsUpdate = true;
        T.links.visible = true;

        var leftCount = near.filter(function (n) { return T.labels[n[1]] === 1; }).length;
        return leftCount + ' of the 6 nearest employees in the map left';
    }

    $('predict-form').addEventListener('submit', function (e) {
        e.preventDefault();
        var btn = $('predict-btn');
        var val = function (id) { return $(id).value; };
        var payload = {
            age: val('age'), monthlyIncome: val('monthlyIncome'), yearsAtCompany: val('yearsAtCompany'),
            jobSatisfaction: val('jobSatisfaction'), overtime: val('overtime'),
            distanceFromHome: val('distanceFromHome'), numPromotions: val('numPromotions'),
            workLifeBalance: val('workLifeBalance'), performanceRating: val('performanceRating'),
            model: val('model')
        };
        btn.disabled = true; btn.textContent = 'Analysing...';

        fetch('/predict', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
            .then(function (r) { if (!r.ok) throw new Error('Server error'); return r.json(); })
            .then(function (out) {
                var box = $('result');
                box.classList.remove('hidden');

                var badge = $('result-badge');
                badge.className = 'badge ' + (out.prediction === 1 ? 'risk' : 'safe');
                badge.textContent = out.label;

                var ring = $('ring-fg');
                ring.style.stroke = out.prediction === 1 ? '#ff5d73' : '#2ee6a6';
                requestAnimationFrame(function () {
                    requestAnimationFrame(function () { ring.style.strokeDashoffset = 326.7 * (1 - out.risk_score / 100); });
                });
                animateNumber($('risk-num'), out.risk_score, 1, '', 1000);

                var text = 'Model confidence: ' + out.confidence + '%';
                var neighbours = placeMarker({
                    sat: +payload.jobSatisfaction, wlb: +payload.workLifeBalance,
                    inc: +payload.monthlyIncome, yrs: +payload.yearsAtCompany
                }, out.prediction);
                if (neighbours) text += '  |  ' + neighbours;
                $('confidence-text').textContent = text;
            })
            .catch(function () {
                $('result').classList.remove('hidden');
                $('result-badge').className = 'badge risk';
                $('result-badge').textContent = 'Could not reach the server';
                $('confidence-text').textContent = 'Is app.py still running?';
            })
            .then(function () { btn.disabled = false; btn.textContent = 'Run prediction'; });
    });
})();
