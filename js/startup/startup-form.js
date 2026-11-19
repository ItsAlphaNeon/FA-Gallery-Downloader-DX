// The start page body, laid out like an FA page: download form and (via the slot) progress/log in the
// main column, library actions and account lists in the right sidebar.
export default {
  name: 'status-form',
  template: `
  <div class="content-with-sidebar user-input-container">
    <div class="content">
      <section>
        <div class="section-header"><h2>Download</h2></div>
        <div class="section-body">
          <form class="user-input" @submit.prevent="sendData">
            <label for="username">{{galleryOptionsLabel}}</label>
            <div class="user-input__gallery-options">
              <input type="text" class="textbox" id="username" v-model.trim="username" placeholder="Usernames or a submission link" autocomplete="off" />
              <button id="start-download" class="button">{{downloadText}}</button>
              <button id="stop-all" class="button red" type="button" :disabled="notActive" @click="stopAll">Stop</button>
            </div>
            <p class="font-small hint">{{inputHint}}</p>
            <fieldset class="user-input__scrape-options" :disabled="isSubmissionUrl" :class="{ 'scrape-options--disabled': isSubmissionUrl }">
              <legend>Include:</legend>
              <label><input type="checkbox" id="scrape-gallery" v-model="scrapeGallery" /> Gallery &amp; scraps</label>
              <label><input type="checkbox" id="scrape-comments" v-model="scrapeComments" /> Comments</label>
              <label><input type="checkbox" id="scrape-favorites" v-model="scrapeFavorites" /> Favorites</label>
            </fieldset>
            <p v-if="scrapeFavorites && !isSubmissionUrl" class="warning">Favorites can be a HUGE amount of submissions!</p>
          </form>
        </div>
        <div class="section-footer font-small">
          <span class="activity" :class="{ 'activity--busy': !notActive }">{{notActive ? 'Idle' : 'Working...'}}</span>
        </div>
      </section>
      <slot></slot>
    </div>

    <div class="sidebar startup-sidebar">
      <div>
        <div class="sidebar-heading">Library</div>
        <div class="button-row library-actions">
          <button id="view-gallery" type="button" class="button" @click="viewGallery">View Gallery</button>
          <button id="repair" type="button" class="button" @click="repair" :title="repairAlt">Repair Database</button>
          <button class="button user-input__file" type="button" id="old_downloads" @click="importData" title="Previous data should be in the same folder as this program">Import old data</button>
        </div>
        <p class="font-small hint">Missing data? <b>Repair</b> re-checks tags, ratings and dates. <b>Import</b> pulls in a previous install placed next to this program.</p>
      </div>

      <div class="account-list">
        <div class="sidebar-heading">Accounts</div>
        <div class="tab-container" role="tablist">
          <button type="button" role="tab" class="tab" :class="{ active: tab === 0 }" :aria-selected="tab === 0" @click="tab = 0">
            Logged in ({{accounts.length}})
          </button>
          <button type="button" role="tab" class="tab" :class="{ active: tab === 1 }" :aria-selected="tab === 1" @click="tab = 1">
            Downloaded ({{computedDownloadAccounts.length}})
          </button>
        </div>
        <div v-if="tab === 0" class="tab-content-container">
          <p v-if="!accounts.length" class="font-small hint">Log in to an account to see it listed here.</p>
          <ul v-else>
            <li v-for="name in accounts" :key="name">
              <span>{{name}}</span>
              <button type="button" class="icon-btn" @click="deleteAccount(name)" title="Forget this login">✖</button>
            </li>
          </ul>
        </div>
        <div v-else class="tab-content-container">
          <p v-if="!computedDownloadAccounts.length" class="font-small hint">Nothing downloaded yet.</p>
          <ul v-else>
            <li v-for="name in computedDownloadAccounts" :key="name">
              <a href="#" @click.prevent="username = name" title="Put this name in the download box">{{name}}</a>
              <button type="button" class="icon-btn" @click="deleteUserAccount(name)" title="Delete this user's downloaded data">✖</button>
            </li>
          </ul>
        </div>
      </div>
    </div>
  </div>
  `,
  emits: ['sendData', 'sendEvent'],
  props: ['outsideUsername', 'isLoggedIn', 'outsideActive', 'accounts', 'downloadAccounts'],
  data() {
    return {
      username: '',
      scrapeGallery: true,
      scrapeComments: true,
      scrapeFavorites: false,
      notActive: true,
      tab: 0,
      repairAlt: 'Check and repair submission data (tags, ratings, etc.)',
    };
  },
  watch: {
    outsideUsername(newName) {
      if (newName) this.username = newName;
    },
    outsideActive(val) {
      this.notActive = !val;
    },
  },
  computed: {
    isSubmissionUrl() {
      return /^https?:\/\/(?:www\.)?furaffinity\.net\/view\/\d+\/?$/i.test(this.username);
    },
    galleryOptionsLabel() {
      return this.isSubmissionUrl ? 'Submission to download' : 'Users to download';
    },
    inputHint() {
      if (this.isSubmissionUrl) return 'Downloads just this one submission.';
      if (!this.username) return 'Leave empty to continue a previous download.';
      return 'Separate several users with commas.';
    },
    name() {
      return this.username.toLowerCase().trim().replace(/_/gi, '');
    },
    downloadText() {
      if (this.isSubmissionUrl) return 'Download Submission';
      return (this.username) ? 'Download' : 'Continue Previous';
    },
    computedDownloadAccounts() {
      if (!this.downloadAccounts?.length) return [];
      return [...new Set(this.downloadAccounts.map(d => d.username))];
    },
  },
  methods: {
    viewGallery() {
      this.$emit('sendEvent', 'view-gallery');
    },
    repair() {
      this.$emit('sendEvent', 'repair');
    },
    stopAll() {
      this.notActive = true;
      this.$emit('sendEvent', 'stop-all');
    },
    sendData() {
      if (this.isSubmissionUrl) {
        const submissionUrl = this.username.trim();
        this.username = '';
        this.$emit('sendData', { submissionUrl });
      } else {
        const { name, scrapeGallery, scrapeComments, scrapeFavorites } = this;
        this.$emit('sendData',  { name, scrapeGallery, scrapeComments, scrapeFavorites });
      }
    },
    deleteAccount(name) {
      if (window.confirm(`Remove account: [${name}]? \nNOTE: You'll need to login again to access it.`)) {
        this.$emit('sendEvent', { choice: 'delete-account', name });
      }
    },
    deleteUserAccount(name) {
      if (window.confirm(`Remove account: [${name}]? \nNOTE: Will delete all associated submissions and favorites.`)) {
        this.$emit('sendEvent', { choice: 'delete-user-account', name });
      }
    },
    importData() {
      this.$emit('sendEvent', { choice: 'import-old-data' });
    },
  }
}
