export default {
  name: 'status-display',
  template: `
    <div class="status-container">
      <section class="progress-panel">
        <div class="section-header"><h2>Progress</h2></div>
        <div class="section-body">
        <div class="progress-row">
          <label for="data-progress-bar">Data</label>
          <progress id="data-progress-bar" :value="data.value" :max="data.max"></progress>
          <span class="progress-desc">{{computedDataProgress}}</span>
        </div>
        <div class="progress-row">
          <label for="file-progress-bar">File</label>
          <progress id="file-progress-bar" :value="file.value" :max="file.max"></progress>
          <span class="progress-desc">{{file.value ? Math.round(file.value / file.max * 100) + '%' : ''}}</span>
        </div>
        <div class="progress-filename font-small" :title="filename">{{filename}}</div>
        </div>
      </section>
      <section class="log-panel">
        <div class="section-header log-panel__header">
          <h2>Status log <span class="font-small">(newest first)</span></h2>
          <button type="button" class="button" :disabled="!msgs.length" @click="msgs = []">Clear</button>
        </div>
        <div id="status" class="section-body">
          <p v-if="!msgs.length" class="hint">Nothing yet. Start a download and progress will show up here.</p>
          <p v-for="(msg, index) in reversedMsgs" :key="msgs.length - index">{{msg.text}}</p>
        </div>
      </section>
    </div>
  `,
  props: ['msg', 'logProgress', 'isActive'],
  emits: ['clearMsg'],
  data() {
    return {
      msgs: [],
      // Progress bar
      data: {
        value: 0,
        max: 1,
      },
      file: {
        value: 0,
        max: 1
      },
      filename: '',
    };
  },
  computed: {
    computedDataProgress() {
      if (!this.data.value) return '';
      return `${this.data.value} / ${this.data.max}`;
    },
    reversedMsgs() {
      return [...this.msgs].reverse();
    },
  },
  watch: {
    msg(newMsg) {
      if (!newMsg) return;
      this.addToStatus(newMsg);
    },
    logProgress(val) {
      if (!this[val.bar]) return;
      if (val.reset) {
        this[val.bar].value = 0;
        this[val.bar].max = 1;
      } else {
        this[val.bar].value = val.value;
        this[val.bar].max = val.max
        const bar = val.bar
        if (val.value >= val.max) {
          setTimeout(() => {
            this[bar].value = 0;
          }, 500);
        }
      }
      if (val.bar === 'file') {
        if (!val.value) this.filename = '';
        else this.filename = val.filename || this.filename;
      }
    },
  },
  methods: {
    prune() {
      if (this.msgs.length > 100)
        this.msgs.shift();
    },
    addToStatus(msg) {
      msg.text = msg.text?.trim();
      if (msg.id && msg.replaceLast) {
        const index = this.msgs.findIndex((val) => val.id === msg.id);
        if (index !== -1) this.msgs[index].text = msg.text;
        else this.msgs.push(msg);
      } else if (msg.replaceLast && this.msgs.length) {
        this.msgs[this.msgs.length - 1].text = msg.text
      } else this.msgs.push(msg);
      this.$emit('clearMsg');
      this.prune();
    }
  }
}
