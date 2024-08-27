/* eslint-disable promise/prefer-await-to-callbacks */
import io from 'socket.io-client';
import { addResponseMessage } from 'react-chat-widget';
import { addLogRecord } from './actions/logger';
import {
  setShapes,
  saveMotorPosition,
  updateMotorState,
  setBeamInfo,
  startClickCentringAction,
  updateShapesAction,
  setPixelsPerMm,
  videoMessageOverlay,
  setCurrentPhase,
} from './actions/sampleview';
import {
  updateBeamlineHardwareObjectAction,
  updateBeamlineHardwareObjectValueAction,
  updateBeamlineHardwareObjectAttributeAction,
} from './actions/beamline';
import {
  setActionState,
  addUserMessage,
  newPlot,
  plotData,
  plotEnd,
} from './actions/beamlineActions';
import {
  setStatus,
  addTaskResultAction,
  updateTaskLimsData,
  addTaskAction,
  stopQueue,
  setCurrentSample,
  addDiffractionPlanAction,
  setSampleAttribute,
  getQueue,
} from './actions/queue';
import { collapseItem, showResumeQueueDialog } from './actions/queueGUI';
import { showConnectionLostDialog } from './actions/general';

import {
  showWorkflowParametersDialog,
  showGphlWorkflowParametersDialog,
  updateGphlWorkflowParametersDialog,
} from './actions/workflow';

import { getRaState, incChatMessageCount } from './actions/remoteAccess';

import { signOut, getLoginInfo } from './actions/login';

import {
  setSCState,
  setLoadedSample,
  setSCGlobalState,
  updateSCContents,
} from './actions/sampleChanger';

import {
  setHarvesterState,
  updateHarvesterContents,
} from './actions/harvester';

import { setEnergyScanResult } from './actions/taskResults';

import { CLICK_CENTRING } from './constants';
import { store } from './store';
import { hideWaitDialog, showWaitDialog } from './actions/waitDialog';

class ServerIO {
  constructor() {
    this.hwrSocket = null;
    this.loggingSocket = null;
    this.connected = false;
    this.initialized = false;
  }

  disconnect() {
    this.connected = false;
    this.hwrSocket?.close();
    this.loggingSocket?.close();
  }

  connect() {
    if (this.hwrSocket === null) {
      this.hwrSocket = io.connect(
        `//${document.domain}:${window.location.port}/hwr`,
      );
      this.hwrSocket.on('connect', () => {
        console.log('hwrSocket connected!'); // eslint-disable-line no-console
      });
      this.loggingSocket = io.connect(
        `//${document.domain}:${window.location.port}/logging`,
      );
      this.loggingSocket.on('connect', () => {
        console.log('loggingSocket connected!'); // eslint-disable-line no-console
      });
    } else {
      this.hwrSocket.connect();
      this.loggingSocket.connect();
    }
  }

  // eslint-disable-next-line sonarjs/cognitive-complexity
  listen() {
    this.connect();

    if (this.initialized) {
      return;
    }

    this.initialized = true;
    this.dispatch = store.dispatch;

    this.loggingSocket.on('log_record', (record) => {
      if (record.severity !== 'DEBUG') {
        this.dispatch(addUserMessage(record));
      }
      this.dispatch(addLogRecord(record));
    });

    this.loggingSocket.on('disconnect', (reason) => {
      console.log('loggingSocket disconnected!'); // eslint-disable-line no-console

      if (reason === 'io server disconnect') {
        const socket = this.loggingSocket;
        setTimeout(() => {
          socket.connect();
        }, 500);
      }
    });

    this.hwrSocket.on('ra_chat_message', (record) => {
      const { username } = store.getState().login.user;
      if (record.username !== username && !record.read) {
        addResponseMessage(
          `${record.date} **${record.nickname}:** \n\n ${record.message}`,
        );
        this.dispatch(incChatMessageCount());
      }
    });

    this.hwrSocket.on('motor_position', (record) => {
      this.dispatch(saveMotorPosition(record.name, record.position));
    });

    this.hwrSocket.on('motor_state', (record) => {
      this.dispatch(updateMotorState(record.name, record.state));
    });

    this.hwrSocket.on('update_shapes', (record) => {
      this.dispatch(setShapes(record.shapes));
    });

    this.hwrSocket.on('update_pixels_per_mm', (record) => {
      this.dispatch(setPixelsPerMm(record.pixelsPerMm));
    });

    this.hwrSocket.on('beam_changed', (record) => {
      this.dispatch(setBeamInfo(record.data));
    });

    this.hwrSocket.on('hardware_object_changed', (data) => {
      this.dispatch(updateBeamlineHardwareObjectAction(data));
    });

    this.hwrSocket.on('hardware_object_attribute_changed', (data) => {
      this.dispatch(updateBeamlineHardwareObjectAttributeAction(data));
    });

    this.hwrSocket.on('hardware_object_value_changed', (data) => {
      this.dispatch(updateBeamlineHardwareObjectValueAction(data));
    });

    this.hwrSocket.on('grid_result_available', (data) => {
      this.dispatch(updateShapesAction([data.shape]));
    });

    this.hwrSocket.on('energy_scan_result', (data) => {
      this.dispatch(setEnergyScanResult(data.pk, data.ip, data.rm));
    });

    this.hwrSocket.on('update_task_lims_data', (record) => {
      this.dispatch(
        updateTaskLimsData(
          record.sample,
          record.taskIndex,
          record.limsResultData,
        ),
      );
    });

    this.hwrSocket.on('task', (record, callback) => {
      if (callback) {
        callback();
      }

      // The current node might not be a task, in that case ignore it
      if (
        store.getState().queueGUI.displayData[record.queueID] &&
        record.taskIndex !== null
      ) {
        const taskCollapsed =
          store.getState().queueGUI.displayData[record.queueID].collapsed;

        if (
          (record.state === 1 && !taskCollapsed) ||
          (record.state >= 2 && taskCollapsed)
        ) {
          this.dispatch(collapseItem(record.queueID));
        }

        this.dispatch(
          addTaskResultAction(
            record.sample,
            record.taskIndex,
            record.state,
            record.progress,
            record.limsResultData,
            record.queueID,
          ),
        );
      }
    });

    this.hwrSocket.on('add_task', (record) => {
      this.dispatch(addTaskAction(record.tasks));
    });

    this.hwrSocket.on('add_diff_plan', (record, callback) => {
      if (callback) {
        callback();
      }
      this.dispatch(addDiffractionPlanAction(record.tasks));
    });

    this.hwrSocket.on('queue', (record) => {
      if (record.Signal === 'DisableSample') {
        this.dispatch(setSampleAttribute([record.sampleID], 'checked', false));
      } else if (record.Signal === 'update') {
        if (record.message === 'all') {
          this.dispatch(getQueue());
        } else if (record.message === 'observers') {
          const state = store.getState();
          if (!state.login.user.inControl) {
            this.dispatch(getQueue());
          }
        }
      } else {
        this.dispatch(setStatus(record.Signal));
      }
    });

    this.hwrSocket.on('sc', (record) => {
      switch (record.signal) {
        case 'operatingSampleChanger': {
          this.dispatch(
            showWaitDialog(
              'Sample changer in operation',
              record.message,
              true,
              () => this.dispatch(stopQueue()),
            ),
          );

          break;
        }

        case 'loadingSample':
        case 'loadedSample': {
          this.dispatch(
            showWaitDialog(
              `Loading sample ${record.location}`,
              record.message,
              true,
              () => this.dispatch(stopQueue()),
            ),
          );

          break;
        }

        case 'unLoadingSample':
        case 'unLoadedSample': {
          this.dispatch(
            showWaitDialog(
              `Unloading sample ${record.location}`,
              record.message,
              true,
              () => this.dispatch(stopQueue()),
            ),
          );

          break;
        }

        case 'loadReady': {
          this.dispatch(hideWaitDialog());
          break;
        }

        case 'inSafeArea': {
          this.dispatch(hideWaitDialog());
          break;
        }

        // No default
      }
    });

    this.hwrSocket.on('sample_centring', (data) => {
      if (data.method === CLICK_CENTRING) {
        this.dispatch(startClickCentringAction());
        const msg =
          '3-Click Centring: <br /> Select centered position or center';
        this.dispatch(videoMessageOverlay(true, msg));
      } else {
        const msg = 'Auto loop centring: <br /> Save position or re-center';
        this.dispatch(videoMessageOverlay(true, msg));
      }
    });

    this.hwrSocket.on('disconnect', (reason) => {
      console.log('hwrSocket disconnected!'); // eslint-disable-line no-console

      if (reason === 'io server disconnect') {
        const socket = this.hwrSocket;
        setTimeout(() => {
          socket.connect();
        }, 500);
      }

      if (this.connected) {
        this.connected = false;
        setTimeout(() => {
          this.dispatch(showConnectionLostDialog(!this.connected));
        }, 2000);
      }
    });

    this.hwrSocket.on('connect', () => {
      this.connected = true;
      this.dispatch(showConnectionLostDialog(false));
    });

    this.hwrSocket.on('resumeQueueDialog', () => {
      this.dispatch(showResumeQueueDialog(true));
    });

    this.hwrSocket.on('userChanged', async (message) => {
      const { inControl: wasInControl, requestsControl: wasRequestingControl } =
        store.getState().login.user;

      await this.dispatch(getLoginInfo());

      const newState = store.getState();
      const { inControl, requestsControl } = newState.login.user;
      const hasIncomingRequest = newState.remoteAccess.observers.some(
        (o) => o.requestsControl,
      );

      if (!wasInControl && inControl && !hasIncomingRequest) {
        this.dispatch(showWaitDialog('You were given control', message));
      } else if (wasInControl && !inControl) {
        this.dispatch(showWaitDialog('You lost control'));
      } else if (wasRequestingControl && !requestsControl && !inControl) {
        this.dispatch(showWaitDialog('You were denied control', message));
      }
    });

    this.hwrSocket.on('observersChanged', () => {
      this.dispatch(getRaState());
    });

    this.hwrSocket.on('observerLogout', (observer) => {
      addResponseMessage(
        `**${observer.nickname}** (${observer.ip}) disconnected.`,
      );
    });

    this.hwrSocket.on('observerLogin', (observer) => {
      if (observer.nickname && observer.ip) {
        addResponseMessage(
          `**${observer.nickname}** (${observer.ip}) connected.`,
        );
      } else {
        addResponseMessage(`${observer.nickname} connecting ...`);
      }
    });

    this.hwrSocket.on('forceSignout', () => {
      this.dispatch(signOut());
    });

    this.hwrSocket.on('workflowParametersDialog', (data) => {
      if (data) {
        this.dispatch(showWorkflowParametersDialog(data, true));
      } else {
        this.dispatch(showWorkflowParametersDialog(null, false));
      }
    });

    this.hwrSocket.on('gphlWorkflowParametersDialog', (data) => {
      this.dispatch(showGphlWorkflowParametersDialog(data));
    });

    this.hwrSocket.on('gphlWorkflowUpdateUiParametersDialog', (data) => {
      this.dispatch(updateGphlWorkflowParametersDialog(data));
    });

    this.hwrSocket.on('take_xtal_snapshot', (cb) => {
      cb(window.takeSnapshot());
    });

    this.hwrSocket.on('beamline_action', (data) => {
      this.dispatch(setActionState(data.name, data.state, data.data));
    });

    this.hwrSocket.on('sc_state', (state) => {
      this.dispatch(setSCState(state));
    });

    this.hwrSocket.on('loaded_sample_changed', (data) => {
      this.dispatch(setLoadedSample(data));
    });

    this.hwrSocket.on('set_current_sample', (sample) => {
      this.dispatch(setCurrentSample(sample.sampleID));
    });

    this.hwrSocket.on('sc_maintenance_update', (data) => {
      this.dispatch(setSCGlobalState(data));
    });

    this.hwrSocket.on('sc_contents_update', () => {
      this.dispatch(updateSCContents());
    });

    this.hwrSocket.on('diff_phase_changed', (data) => {
      this.dispatch(setCurrentPhase(data.phase));
    });

    this.hwrSocket.on('new_plot', (plotInfo) => {
      this.dispatch(newPlot(plotInfo));
    });

    this.hwrSocket.on('plot_data', (data) => {
      this.dispatch(plotData(data.id, data.data, false));
    });

    this.hwrSocket.on('plot_end', (data) => {
      this.dispatch(plotData(data.id, data.data, true));
      this.dispatch(plotEnd(data));
    });

    this.hwrSocket.on('harvester_state', (state) => {
      this.dispatch(setHarvesterState(state));
    });

    this.hwrSocket.on('harvester_contents_update', () => {
      this.dispatch(updateHarvesterContents());
    });
  }
}

export const serverIO = new ServerIO();
