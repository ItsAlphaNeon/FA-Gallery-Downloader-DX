import statusDisplay from "./status-display.js";
import startupForm from "./startup-form.js";
import { compareVersions } from "../version.js";

export default {
  name: 'startup-page',
  components: { statusDisplay, startupForm },
  template: `
    <div class="startup-container">
      <nav class="fa-menubar startup-header">
        <span class="fa-menubar__brand">🐾 FA Gallery Downloader DX</span>
        <button class="fa-menubar__item" @click="sendEvent('view-gallery')">Gallery</button>
        <a class="fa-menubar__item" :href="githubLink" @click.prevent="open">Releases</a>
        <span class="fa-menubar__spacer"></span>
        <div class="logged-in-status" :class="{ 'logged-out': !username }">
          <span class="logged-in-status__text">
            <template v-if="username">Logged in as <b>{{username}}</b></template>
            <template v-else>Not logged in</template>
          </span>
          <button class="fa-menubar__item" @click="sendEvent('login')">{{username ? 'Switch account' : 'Log in'}}</button>
          <img v-if="iconSrc" class="fa-menubar__avatar" :src="iconSrc" @error="fixIcon" alt=""/>
        </div>
      </nav>
      <startup-form :is-logged-in="!!username" :outsideUsername="queryName" :outsideActive="isActive" :accounts="accounts" :download-accounts="downloadAccounts" @send-data="sendFormData" @send-event="sendEvent">
        <status-display :msg="msg" :log-progress="logProgress" :is-active="isActive" @clear-msg="clearMsg"></status-display>
      </startup-form>
      <footer class="fa-footer version">
        <div class="credits">FA Gallery Downloader DX | originally by SpottedSqueak, maintained by AlphaNeon | Not affiliated with Fur Affinity</div>
        <span v-if="!version">Loading version...</span>
        <template v-else>
          <template v-if="hasUpdate">
            <a class="has-update" :href="githubLink" @click.prevent="open">Update available!</a> |
          </template>
          <span>Current: <b>{{version}}</b></span>
          <span v-if="showVersion"> | Latest: <b>{{newVersion}}</b></span>
        </template>
        |
        <a :href="githubLink" @click.prevent="open"><b>Github Repo</b></a>
      </footer>
    </div>
  `,
  data() {
    return {
      queryName: '',
      username: '',
      msg: '',
      logProgress: {},
      isActive: false,
      accounts: [],
      downloadAccounts: [],
      version: '',
      newVersion: '',
      githubLink: 'https://github.com/ItsAlphaNeon/FA-Gallery-Downloader-DX/releases',
    };
  },
  beforeCreate() {
    window.logMsg = ({ text, id, replaceLast }) => {
      this.msg = { text, id, replaceLast };
    };
    window.logProgress = ({ bar, value, max, reset, filename }) => {
      this.logProgress = { bar, value, max, reset, filename };
    };
    window.setPageInfo = (data) => {
      if (data.queryName) this.queryName = data.queryName;
      if (data.username) this.username = data.username;
      if (data.accounts) this.accounts = data.accounts;
      if (data.current) this.version = data.current;
      if (data.latest) this.newVersion = data.latest;
      if (data.downloadAccounts) this.downloadAccounts = data.downloadAccounts;
    };
    window.setActive = (val = true) => {
      this.isActive = val;
    }
  },
  mounted() {
    setInterval(() => {
      window.userPath?.({ choice: 'release-check' });
    }, 10 * 60 * 1000);
  },
  computed: {
    iconSrc() {
      if (!this.username) return '';
      const cleanName = this.username.split(' ')[0].toLowerCase().replace(/[_]/g, '');
      return `https://a.furaffinity.net/${cleanName}.gif`;
    },
    showVersion() {
      return this.version && this.newVersion;
    },
    hasUpdate() {
      return !!this.showVersion && compareVersions(this.newVersion, this.version) > 0;
    }
  },
  methods: {
    clearMsg() {
      this.msg = '';
    },
    sendFormData(data) {
      this.isActive = true;
      data.choice = 'start-download';
      window.userPath?.(data);
    },
    sendEvent(data) {
      if (typeof data === 'string') data = { choice: data };
      if (data.choice === 'repair' || data.choice === 'refresh-details') this.isActive = true;
      if (data.choice === 'stop-all') this.isActive = false;
      window.userPath?.(data);
    },
    fixIcon(e) {
      e.target.src = '../html/resources/_default.gif';
    },
    open(e) {
      const url = e.currentTarget.href;
      window.userPath?.({ choice: 'open', url });
    },
  },
}
