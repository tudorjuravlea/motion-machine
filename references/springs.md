# Springs

One convention for every spring in the kit. The spring engines in common use (react-spring, Motion, Remotion, Popmotion, anime.js, Motion Canvas) share one equation and differ only in units and in how they let the author state it, so a conversion is a change of units and nothing more.

## The convention

- The motion is a mass on a damped spring, measured in seconds, starting at rest at 0 and pulled toward 1: the pull is stiffness times the remaining distance, the drag is damping times the current speed, and the mass divides both
- The position is computed in closed form from the time. It is never stepped forward by a numeric integrator, because integrators drift with the step size and the closed form survives any frame rate
- Authored as a triple: stiffness k, damping c, mass m
- Authored as a perceptual pair: bounce b from -1 to 1 and a natural period T in seconds
- The damping ratio zeta is c divided by twice the square root of k times m. Below 1 the spring overshoots; at or above 1 it creeps in without overshoot
- Overshoot is how far the curve passes 1, as a fraction of the travel, at its first peak. It depends on zeta alone
- Settled means within 0.005 of the target and staying there. The settle time is measured when the piece is built, so layout and the cut that follows can depend on it
- Hold the settled value exactly at 1 afterwards; a spring that has not settled before its clip ends is a defect

## The three presets

| name | k | c | m | zeta | overshoot | settle (s) | use |
|---|---|---|---|---|---|---|---|
| ui | 420 | 34 | 1 | 0.83 | 0.9 % | 0.35 | plates, chips, small movers |
| type | 200 | 28 | 1 | 0.99 | 0 % | 0.51 | text, which never overshoots |
| heavy | 180 | 30 | 2 | 0.79 | 1.7 % | 0.76 | large masses, device frames |

- The figures are computed from the closed form, not eyeballed, and were checked again at 0.5 ms resolution
- Type never overshoots and opacity never overshoots, whatever the style allows [SPEC §15]
- A motion style may allow more bounce up to an overshoot ceiling of 0.30; the default ceiling is 0.15, and W-OVERSHOOT reads the measured value [SPEC §15]

## The perceptual form

- Bounce at or above 0 gives zeta = 1 - b; below 0 gives zeta = 1 / (1 + b), so negative bounce is a sluggish, over-damped feel
- Stiffness follows from the period: k = (2 pi / T) squared, with mass 1; damping then follows from zeta as 2 zeta times the square root of k
- Worked check: bounce 0.2 and period 0.5 s give zeta 0.8, k of about 158, c of about 20, and an overshoot near 1.5 %
- Working range for bounce is -0.5 to 0.5; engines default to 0.25 (Motion) and 0.5 (anime.js); sensible UI-scale bounce sits at 0.1-0.3
- Perceived duration of a spring is usually 0.6-0.8 s in practice

## Conversion table

| from | stiffness / damping / mass | bounce / duration | other conventions |
|---|---|---|---|
| react-spring | tension is k, friction is c (identity); mass 1 | not offered | its default 170/26 is type-like (zeta about 1.0); stiff 210/20 is ui-like (zeta about 0.69) |
| Motion, physics form | stiffness is k, damping is c, mass is m (identity) | bounce as above; period T = 1.2 x visualDuration | rest thresholds there are looser (speed 0.1, distance 0.01); ours is 0.005 |
| Remotion | identity, with t = frame / fps | durationInFrames stretches time rather than changing k | its per-step cap of 64 ms is unnecessary in closed form |
| Popmotion | identity, milliseconds to seconds | zeta = 1 - bounce | duration given in ms |
| anime.js | identity (its default 100/10/1 gives zeta 0.5) | duration in ms equals T in ms; bounce as Motion | bouncy extreme 120/6 (zeta about 0.27) |
| Motion Canvas | identity | not offered | its defaults are very soft (zeta about 0.35); rarely wanted |

## Related easing facts

- Ease families by character: quad is quiet, cubic is decisive, expo is for hero arrivals, back adds intent
- Back easing overshoots by a constant near 1.70; elastic uses amplitude 1 and period 0.3; both are tweens with fixed shapes, not springs
- Per-frame smoothing such as "move 10 % of the way each frame" carries hidden history; express it as a closed form of elapsed time instead
- A scale entrance starts at 0.9-0.97 with opacity, never from zero
- Entrances use ease-out; resolution is fast and ease-out, deliberate build is slow and linear
