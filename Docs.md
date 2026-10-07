# CPUFlow - Interactive CPU Execution & Performance Simulator

*See what happens inside a CPU.* CPUFlow is a Computer Organization laboratory in the browser. You write assembly, run it on a
simulated processor, and watch instructions move through the control unit, registers, ALU, pipeline, cache and memory while CPI, MIPS and
speedup are recalculated from the actual simulation.

## Features
- **CPU Simulator** - editor with line highlights, animated SVG datapath, live PC/IR/MAR/MDR/CIR, register bank (decimal / hex / binary, old to new), ALU panel, memory viewer, micro-operation log, terminal, instruction trace, control-signal LEDs, Execution / Architecture modes, demo callout ("Try the simulator").
- **Pipeline Lab** - 5-stage pipeline (IF ID EX MEM WB) with moving instruction tokens, timeline chart, data / control / structural hazards, stalls, forwarding on/off with arcs, branch flush animation, hazard log, three-way comparison.
- **Cache & Memory Lab** - direct / fully associative / set associative, FIFO / LRU, adjustable size, block size, ways, miss penalty; animated CPU -> cache -> memory packets; tag/index/offset breakdown; hit/miss chart; AMAT; memory hierarchy path; access patterns (sequential, loop, random, conflict, replay of your program).
- **Control Unit Lab** - control signals per instruction, hardwired vs microprogrammed (control address, control memory, micro-words) stepping with the program.
- **Performance Analyzer** - IC, cycles, CPI, execution time, MHz, MIPS, efficiency, hit ratio, stalls, speedup; live charts; formula explorer; interactive Amdahl's Law curve; configuration comparison with animated bars.
- **Architecture page** - clickable architecture diagram, Flynn's classification (SISD/SIMD/MISD/MIMD) with animated streams, I/O lab (programmed I/O, interrupts, DMA).
- **Concepts page** - interactive explainers built on the real simulator classes.

## Technologies
Node.js, Express, EJS, vanilla JavaScript, CSS, SVG. No front-end frameworks and no database. The simulation modules are UMD files:
Node `require`s them for the JSON API and tests, and the browser loads the *same files* from `/sim`.

## Installation and running
```
npm install
npm start        # or: node app.js
```
Open http://localhost:3000 (set `PORT` to change). `npm test` runs the engine tests.

## Project structure
```
app.js                       Express app
routes/index.js              page + API routes
controllers/simulationController.js   renders pages in layout.ejs; /api/parse, /api/run, /api/programs
simulation/                  engine (no DOM): InstructionParser, ALU, RegisterFile, Memory, Cache, ControlUnit,
                             Pipeline, CPU, PerformanceAnalyzer, SimulationEngine, Programs, SimError
views/                       layout + pages + partials (transport, program panel, nav)
public/css, public/js        styling, UI toolkit (ui.js), charts, SVG scenes (visualization.js), page scripts
tests/engine.test.js         engine tests
```

## How the simulator works
`SimulationEngine` owns the clock. Each `step()` advances the CPU by exactly one cycle and returns **events** (fetch, decode, regread, alu,
forward, mem, writeback, branch, hazard, stall, flush...) plus **micro-operations**. The UI subscribes, renders everything from
`engine.getState()`, and plays animations *from those events*. Animation speed is separate from simulation state, and animations can be
skipped without changing results. Same program + same configuration always gives the same result.

One pipeline implementation drives both modes. With the pipeline disabled only one instruction is in flight (5 cycles each plus cache stalls); enabled, up to five overlap.

### Machine model
- Word-addressed memory, 1024 words (0-1023). **Memory[A] starts equal to A**, so `LOAD R1, 20` gives 20 (and goes through the cache).
- `LOAD Rd, addr` reads memory; `STORE Rs, addr` writes. `addr` is a number, `[number]`, `Rn` or `[Rn]`.
- Registers R0-R7 are ordinary registers (all start at 0). Instruction memory is separate from the data cache (Harvard style).
- Cache: write-through, write-allocate. A hit costs 1 cycle in MEM; a miss costs 1 + miss penalty (default 4) and freezes the pipeline.
- Branch targets are 1-based instruction numbers (target = count + 1 means "end") or `label:` names. Branches resolve in EX, predict not-taken.

## Supported instructions
`LOAD STORE ADD SUB MUL DIV MOV AND OR XOR CMP JMP BEQ BNE NOP` (+ `HALT`). Third operand of ALU ops and the second of MOV/CMP may be a register or an immediate (decimal or `0x` hex). Comments start with `;`.
Errors such as `Invalid register R9`, `ADD requires 3 operands`, `Unknown instruction: XYZ`, invalid addresses and branch targets are shown inline; runtime errors (division by zero, bad indirect address, cycle limit of 5000) stop the run without crashing.

## Supported cache modes
Direct mapped (1 way), fully associative (1 set), n-way set associative (2/4/8); replacement FIFO or LRU; 4-64 lines; 1-16 word blocks.

## Pipeline explanation
IF fetch, ID decode and register read, EX ALU / address / branch decision, MEM cache access, WB register write.
- **Data hazards (RAW)**: without forwarding, a dependent instruction waits in ID until the producer reaches WB (2 stalls for adjacent instructions). With forwarding, results go EX/MEM -> EX or MEM/WB -> EX; only load-use costs 1 stall.
- **Control hazards**: taken branches flush the two younger instructions.
- **Structural hazards**: with the single memory port option, a LOAD/STORE in MEM blocks the fetch in that cycle.

## Performance formulas
- `CPI = total cycles / instruction count`
- `CPU time = IC x CPI x clock cycle time`
- `MIPS = IC / (execution time x 10^6)` = clock MHz / CPI
- `Pipeline efficiency = IC / cycles` (IPC relative to the ideal 1)
- `Speedup = cycles of the sequential run / cycles of the current run` (baseline is a real headless run)
- `AMAT = hit time + miss ratio x miss penalty`
- `Amdahl: Speedup = 1 / ((1 - f) + f / s)`

## API
`GET /api/programs`, `POST /api/parse {source}`, `POST /api/run {source, config}` (runs headlessly and returns registers + metrics).

## Keyboard
Space run/pause, N step cycle, I step instruction, R reset (when not typing in a field).

## Notes and limits
The I/O lab and the memory-hierarchy figures (L2/L3/RAM/storage latencies) are illustrative models for teaching; only the L1 cache is simulated. Cache and pipeline results come from the real engine.
