# 2048 RL — Entrenamiento con Deep Q-Network y Visualizador Web

Proyecto de aprendizaje por refuerzo que entrena un agente DQN para jugar al 2048, con un visualizador web que reproduce las épocas de entrenamiento y permite exportar video.

---

## Arquitectura general

```
┌─────────────────────────────────────────────────────────┐
│                    STACK COMPLETO                       │
├──────────────────────────┬──────────────────────────────┤
│     ENTRENAMIENTO        │      VISUALIZACIÓN           │
│                          │                              │
│  Python                  │  HTML / CSS / JS             │
│  ├── game2048.py         │  ├── index.html              │
│  ├── env.py              │  ├── style.css               │
│  ├── agent.py            │  └── visualizer.js           │
│  └── train.py            │                              │
│                          │  Lee JSONs de replays/       │
│  Genera → replays/*.json │  y los anima en browser      │
└──────────────────────────┴──────────────────────────────┘
```

El entrenamiento corre en Python puro (máxima velocidad, sin render). Cada N episodios guarda el mejor episodio de esa época como JSON. El visualizador web carga esos JSONs y reproduce la partida paso a paso, con opción de exportar a `.webm`.

---

## Archivos

| Archivo | Rol |
|---|---|
| `game2048.py` | Lógica pura del juego (numpy, sin render) |
| `env.py` | Entorno Gymnasium que envuelve el juego |
| `agent.py` | Red DQN, replay buffer y agente |
| `train.py` | Loop de entrenamiento, guarda replays y checkpoints |
| `web/index.html` | Visualizador web (abrir en browser) |
| `web/style.css` | Estilos del visualizador |
| `web/visualizer.js` | Lógica de reproducción y export de video |

---

## Requisitos

```bash
pip install torch numpy gymnasium
```

No se requieren dependencias para el visualizador web (vanilla JS).

---

## Cómo usar

### 1. Entrenar el agente

```bash
python train.py
```

Parámetros configurables al inicio de `train.py`:

| Variable | Default | Descripción |
|---|---|---|
| `NUM_EPISODES` | 10000 | Episodios totales de entrenamiento |
| `SAVE_REPLAY_EVERY` | 500 | Guardar replay cada N episodios |
| `CHECKPOINT_EVERY` | 1000 | Guardar checkpoint del modelo cada N episodios |
| `TARGET_UPDATE_EVERY` | 500 | Pasos entre actualizaciones de la red target |

Durante el entrenamiento se imprime cada 100 episodios:
```
Episode    100 | Avg Score (last 100):    512.3 | Avg Max Tile:   64.0 | Epsilon: 0.9512
```

Al finalizar se generan:
- `replays/epoch_500.json`, `replays/epoch_1000.json`, … — replays del mejor episodio de cada época
- `checkpoints/checkpoint_ep1000.pt`, … — pesos del modelo
- `checkpoints/final_model.pt` — modelo final
- `training_stats.json` — historial completo de scores y max tiles

### 2. Visualizar las épocas

Abrir `index.html` directamente en el browser (Chrome recomendado):

```
file:///C:/Users/JuanC/Desktop/bot1/web/index.html
```

1. Hacer clic en **"Choose JSON file"** y seleccionar un archivo de `replays/`
2. Usar los controles de playback: Play/Pause, velocidad (0.5x → 10x), paso anterior/siguiente
3. Atajos de teclado: `Space` = play/pause, `←` / `→` = paso a paso

### 3. Exportar video

1. Cargar un replay en el visualizador
2. Hacer clic en **"Export Video"**
3. El replay se reproduce automáticamente capturando cada frame
4. Al terminar se descarga un archivo `.webm` con la partida

---

## Cómo funciona el agente

### Estado
El tablero 4x4 se aplana a un vector de 16 valores, normalizados como `log2(tile + 1) / 17`. Esto convierte valores como 2, 4, 8, … 2048 a un rango continuo [0, 1].

### Red neuronal (DQN)
```
Input (16) → Linear(256) → ReLU → Linear(256) → ReLU → Output (4)
```
Salida: Q-values para cada acción (arriba, abajo, izquierda, derecha).

### Reward
- `score_actual - score_anterior` si el movimiento cambia el tablero
- `-1` si el movimiento es inválido (el tablero no cambia)

### Exploración
Epsilon-greedy con decaimiento exponencial: empieza en `ε=1.0` (100% aleatorio) y decae hasta `ε=0.01`.

### Replay Buffer
Buffer circular de 50.000 transiciones. Se muestrea un batch de 64 en cada paso de entrenamiento para romper la correlación entre muestras consecutivas.

### Red Target
Se mantiene una copia de la red ("target network") que se actualiza cada 500 pasos. Esto estabiliza el entrenamiento al fijar los Q-values objetivo durante ventanas de tiempo.

---

## Formato de los replays JSON

```json
{
  "epoch": 500,
  "episode": 1234,
  "score": 8192,
  "max_tile": 512,
  "steps": [
    {
      "board": [[0, 2, 4, 8], [16, 32, 64, 128], [256, 512, 0, 0], [0, 0, 0, 2]],
      "score": 100,
      "action": 2
    }
  ]
}
```

`action`: 0=arriba, 1=abajo, 2=izquierda, 3=derecha.

Cada archivo contiene el mejor episodio (mayor score) dentro de esa ventana de 500 episodios.

---

## Estructura de carpetas generada tras el entrenamiento

```
bot1/
├── web/
│   ├── index.html
│   ├── style.css
│   └── visualizer.js
├── replays/
│   ├── epoch_500.json
│   ├── epoch_1000.json
│   └── ...
├── checkpoints/
│   ├── checkpoint_ep1000.pt
│   └── final_model.pt
├── training_stats.json
├── game2048.py
├── env.py
├── agent.py
└── train.py
```

---

## Mejoras posibles

- Reemplazar DQN por **PPO** (más estable en episodios largos)
- Agregar **MCTS** como política de búsqueda (muy efectivo en 2048)
- Usar representación **one-hot** del tablero en lugar de log2 (puede mejorar el aprendizaje)
- Agregar **gráfico de entrenamiento** en el visualizador web cargando `training_stats.json`
- Implementar **curriculum learning**: empezar con tableros pre-llenados para acelerar el aprendizaje
