# QCD glueball research boundary

The name **GLUBALL** is close enough to **glueball** that useful physics literature can become either a productive research prompt or a semantic trap. This document makes the boundary explicit.

## What the external literature actually says

Hilmar Forkel's 2004 paper *QCD Vacuum Topology and Glueballs* (`arXiv:hep-ph/0407270`) studies spin-0 glueball properties while keeping track of topological gluon structure. Its abstract and associated summary discuss instantons, topological charge screening, and a class of infrared vortex/knot configurations of Faddeev-Niemi type that may be relevant to glueballs.

That is scientifically interesting for GLUBALL because this repository already studies an independently specified knot geometry and deterministic ways to sample it. It is **not** a derivation of `GLUBALL-KNOT-V1` from QCD.

In 2024, BESIII measured the X(2370) state to have pseudoscalar quantum numbers `0^-+`. Its measured properties are consistent with predictions for a light pseudoscalar glueball candidate. The correct wording is therefore **glueball candidate / glueball-like state**, not "GLUBALL has been experimentally discovered" and not even "X(2370) is definitively a pure glueball."

The supplied Big Think article is useful as an accessible secondary explainer, but primary scientific claims should trace to the BESIII Physical Review Letters result and relevant QCD/lattice literature.

## Allowed research use

These sources may motivate a separate, explicitly non-authoritative research layer that asks questions such as:

- which knot/vortex invariants are useful numerical stress tests;
- whether GLUBALL's bounded sampler is useful for exploring families of closed curves and tubes;
- how topological observables could be encoded as **research observables** without changing canonical geometry;
- whether future lattice-QCD datasets can be imported as independent numerical data and compared against generic geometric descriptors;
- how a Rust/CUDA runtime behaves on large topology-heavy numerical workloads.

The useful bridge is therefore **computation and mathematical instrumentation**, not physical identification.

## Forbidden inference

None of the following may be asserted from these sources:

```text
GLUBALL-KNOT-V1 = a QCD glueball solution
(2,3) torus knot = predicted glueball topology
visual knot resemblance = particle evidence
X(2370) validates GLUBALL
runtime determinism = empirical physics validation
```

A future physical model would need its own equations, dimensional quantities, QCD action/fields or justified effective theory, observable mapping, comparison protocol, uncertainties, and independent evidence. It would receive a new contract identifier rather than silently changing `GLUBALL-KNOT-V1`.

## Runtime implication

This literature does strengthen the case for the native runtime, but for a mundane and useful reason: topology/QCD-inspired numerical experiments can become large quickly.

The current Rust direction keeps:

- exact counts, indices and partitions in integers;
- canonical radii in fixed-point integer units;
- floating point bounded and confined to the trigonometric geometry boundary;
- CPU execution as the first native residual/reference surface;
- future CUDA execution as a separately evidenced accelerator sidecar;
- multi-GPU scheduling deterministic before launch;
- scientific claims separated from benchmark results.

That gives us room to run very large numerical experiments on rented hardware without allowing faster hardware to rewrite what the model means.

## Sources

Machine-readable source metadata lives in [`research/glueball/sources.json`](../research/glueball/sources.json).

Primary/background links:

- Hilmar Forkel, *QCD Vacuum Topology and Glueballs*, arXiv:hep-ph/0407270, DOI `10.1063/1.1843614`.
- BESIII Collaboration, *Determination of Spin-Parity Quantum Numbers of X(2370) as 0^-+ ...*, Physical Review Letters 132, 181901 (2024), DOI `10.1103/PhysRevLett.132.181901`.
- Ethan Siegel, Big Think, *New particle at last! Physicists detect the first "glueball"* (2024), retained as a secondary explainer rather than primary evidence.
