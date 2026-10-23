# синтез V8 (коленвал «крестом», порядок 1-8-4-3-6-5-7-2): импульсы выхлопа по двум рядам, трубы, глушитель.
# Петля — целое число циклов (720°); случайные отклонения по циклам повторяются с периодом петли, рендерим три периода
# и берём средний — фильтры уже в установившемся режиме, петля без шва.
import numpy as np, wave, subprocess, sys
from scipy.signal import lfilter, butter, iirpeak
SR = 22050
ORDER = [1, 8, 4, 3, 6, 5, 7, 2]
BANK = {c: (0 if c % 2 else 1) for c in range(1, 9)}

def pulse(n, tau):
    t = np.arange(n) / SR
    return (t / tau) * np.exp(1 - t / tau)

def synth(rpm, load, cycles, reps, seed):
    r = np.random.default_rng(seed)
    Tc = 120.0 / rpm; n1 = int(round(Tc * cycles * SR)); n = n1 * reps; nc = n1 / cycles
    bias = {c: 1 + r.normal(0, .08) for c in ORDER}
    var = r.normal(0, .05 + .10 * (rpm < 1300), cycles)
    jit = r.normal(0, .00012 * SR, (cycles, 8)); amp = r.normal(0, .04, (cycles, 8))
    tau = .0010 + .0018 * (900 / rpm) ** .5
    P = pulse(int(tau * SR * 9), tau)
    noise = r.normal(0, 1, (cycles, 8, len(P)))
    B = [np.zeros(n + len(P) + 8), np.zeros(n + len(P) + 8)]
    for rep in range(reps):
        for k in range(cycles):
            for i, c in enumerate(ORDER):
                t0 = int(round(rep * n1 + (k + i / 8) * nc + jit[k, i])) % n
                a = bias[c] * (1 + var[k]) * (.5 + .5 * load) * (1 + amp[k, i])
                seg = a * P * (1 + (.08 + .1 * load) * noise[k, i])
                B[BANK[c]][t0:t0 + len(P)] += seg
    out = np.zeros(len(B[0]))
    for bi, fr in enumerate([(92, 205, 430), (86, 192, 470)]):
        x = np.roll(B[bi], int(.0009 * SR) * bi); y = .7 * x
        for f, q, g in zip(fr, (1.4, 2.0, 2.4), (.8, .5, .3)):
            bb, aa = iirpeak(f * (1 + .12 * rpm / 6000), q, fs=SR); y = y + g * lfilter(bb, aa, x)
        out += y
    fc = min(9500, 800 + 2600 * load + rpm * .6)
    bb, aa = butter(2, fc / (SR / 2)); out = lfilter(bb, aa, out)
    bb, aa = butter(1, 30 / (SR / 2), 'high'); out = lfilter(bb, aa, out)
    out = out / (np.abs(out).max() + 1e-9)
    out = np.tanh(out * (1.3 + .9 * load))
    mr = np.random.default_rng(seed + 1).normal(0, 1, n1); mech = np.tile(mr, reps + 1)[:len(out)]
    bb, aa = butter(2, [1800 / (SR / 2), 6000 / (SR / 2)], 'band'); mech = lfilter(bb, aa, mech) * (.02 + .04 * rpm / 7000)
    return (out + mech)[:n], n1

def loop(rpm, load=1.0, seconds=1.3):
    Tc = 120.0 / rpm; cycles = max(3, int(round(seconds / Tc)))
    y, n1 = synth(rpm, load, cycles, 3, int(rpm))
    y = y[n1:2 * n1]
    return y / (np.sqrt((y ** 2).mean()) * 6)

def wav(path, y):
    y = np.clip(y, -1, 1); w = wave.open(path, 'wb'); w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes((y * 32767).astype(np.int16).tobytes()); w.close()

if __name__ == "__main__":
    import json, base64
    D = sys.argv[1]; RPMS = [800, 1400, 2200, 3200, 4300, 5500, 6800]; out = {}
    for r in RPMS:
        y = loop(r); L = len(y) / SR
        wav(f'{D}/v8_{r}.wav', np.concatenate([y, y]))
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', f'{D}/v8_{r}.wav', '-codec:a', 'libmp3lame', '-b:a', '56k', f'{D}/v8_{r}.mp3'], check=True)
        out[r] = {'L': round(L, 6), 'b64': base64.b64encode(open(f'{D}/v8_{r}.mp3', 'rb').read()).decode()}
        print(r, round(L, 3), len(out[r]['b64']) * 3 // 4)
    json.dump(out, open(f'{D}/v8.json', 'w'))

def sweep(rpm_t, load_t, dur, seed=5, miss=None):
    """непериодический рендер: обороты и газ — функции времени; miss(t) — вероятность пропуска вспышки (поломка, заглох)"""
    r = np.random.default_rng(seed); n = int(dur * SR); t = np.arange(n) / SR
    rpm = np.maximum(1, rpm_t(t)); ph = np.cumsum(rpm / 120.0 / SR) * 8   # 8 вспышек на цикл
    idx = np.nonzero(np.diff(np.floor(ph)) > 0)[0]
    B = [np.zeros(n + 2000), np.zeros(n + 2000)]; bias = [1 + r.normal(0, .08) for _ in range(8)]
    for j, i0 in enumerate(idx):
        k = int(np.floor(ph[i0 + 1])) % 8; c = ORDER[k]; tt = i0 / SR
        if miss and r.random() < miss(tt): continue
        rp = rpm[i0]; tau = .0010 + .0018 * (900 / rp) ** .5; P = pulse(int(tau * SR * 9), tau)
        a = bias[k] * (.5 + .5 * load_t(tt)) * (1 + r.normal(0, .06 + .1 * (rp < 1300)))
        B[BANK[c]][i0:i0 + len(P)] += a * P * (1 + .1 * r.normal(0, 1, len(P)))
    out = np.zeros(n + 2000)
    for bi, fr in enumerate([(92, 205, 430), (86, 192, 470)]):
        x = np.roll(B[bi], int(.0009 * SR) * bi); y = .7 * x
        for f, q, g in zip(fr, (1.4, 2.0, 2.4), (.8, .5, .3)):
            bb, aa = iirpeak(f, q, fs=SR); y = y + g * lfilter(bb, aa, x)
        out += y
    bb, aa = butter(2, 2500 / (SR / 2)); out = lfilter(bb, aa, out)
    bb, aa = butter(1, 30 / (SR / 2), 'high'); out = lfilter(bb, aa, out)
    out = np.tanh(out / (np.abs(out).max() + 1e-9) * 2)
    return out[:n]
