/* eslint-disable no-param-reassign */

import {
  createSelector,
  createSlice,
  type PayloadAction,
} from '@reduxjs/toolkit';

export type ShapeState = 'SAVED' | 'TMP' | 'HIDDEN';

interface BaseShape {
  id: string;
  name: string;
  state: ShapeState;
  userState: ShapeState;
  selected: boolean;
  screenCoord: [number, number];
}

export interface PointShape extends BaseShape {
  t: 'P';
}

export interface TwoDPointShape extends BaseShape {
  t: '2DP';
}

export interface LineShape extends BaseShape {
  t: 'L';
  // Both endpoints, flattened: [x1, y1, x2, y2].
  refs: [string, string];
}

export type GridCellCountFunction = 'zig-zag' | 'inverse-zig-zag';

export interface GridShape extends BaseShape {
  t: 'G';
  width: number;
  height: number;
  cellWidth: number;
  cellHeight: number;
  cellHSpace: number;
  cellVSpace: number;
  numCols: number;
  numRows: number;
  cellCountFun: GridCellCountFunction;
  result: string | Record<string, number[]> | null;
  resultDataPath?: string;
  motorPositions: Record<string, number | null>;
  pixelsPerMMX?: number;
  pixelsPerMMY?: number;
}

export type Shape = PointShape | TwoDPointShape | LineShape | GridShape;

export type ShapesById = Record<string, Shape>;

export interface ShapesState {
  shapes: ShapesById;
  overlayLevel?: number;
}

const initialState: ShapesState = {
  shapes: {},
};

// Dispatched from actions/queue.js and actions/login.js respectively, and
// handled by several other reducers too, so they aren't owned by this slice.
interface SetInitialStateAction {
  type: 'SET_INITIAL_STATE';
  data: { shapes: ShapesById };
}

const shapesSlice = createSlice({
  name: 'shapes',
  initialState,
  reducers: {
    setShapes(state, action: PayloadAction<ShapesById>) {
      state.shapes = action.payload;
    },
    addShape(state, action: PayloadAction<Shape>) {
      state.shapes[action.payload.id] = action.payload;
    },
    updateShapes(state, action: PayloadAction<Shape[]>) {
      action.payload.forEach((shape) => {
        state.shapes[shape.id] = shape;
      });
    },
    deleteShape(state, action: PayloadAction<string>) {
      const { [action.payload]: _toRemove, ...shapes } = state.shapes;
      state.shapes = shapes;
    },
    setOverlay(state, action: PayloadAction<number>) {
      state.overlayLevel = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase('SET_CURRENT_SAMPLE', () => initialState)
      .addCase('SET_INITIAL_STATE', (state, action: SetInitialStateAction) => {
        state.shapes = action.data.shapes;
      });
  },
});

export const { setShapes, addShape, updateShapes, deleteShape, setOverlay } =
  shapesSlice.actions;

function selectShapesById(state: { shapes: ShapesState }) {
  return state.shapes.shapes;
}

export const selectSelectedShapeIds = createSelector(
  [selectShapesById],
  (shapesById) =>
    Object.values(shapesById)
      .filter((shape) => shape.selected)
      .map((shape) => shape.id),
);

export default shapesSlice.reducer;
