import galleryTile from "./gallery-tile.js";
import submissionView from './submission-view.js';

const TITLES_KEY = 'fa-gdl-show-titles';
const readTitles = () => { try { return localStorage.getItem(TITLES_KEY) !== '0'; } catch { return true; } };

export default {
  name: 'gallery-hub',
  components: {
    galleryTile,
    submissionView,
  },
  template: `
  <div class="gallery-wrapper">
    <nav class="fa-menubar">
      <a class="fa-menubar__brand" href="#" @click.prevent="showGallery('')">🐾 FA Gallery Viewer</a>
      <button class="fa-menubar__item" :class="{ current: !submissionData && !galleryType }" @click="showGallery('')">Gallery</button>
      <button class="fa-menubar__item" :class="{ current: !submissionData && galleryType }" @click="showGallery('favorites')">Favorites</button>
      <label class="fa-menubar__search" title="Search titles, tags and descriptions ( / )">
        <span aria-hidden="true">🔍</span>
        <input ref="search" type="search" placeholder="Search" v-model="search" @input="debouncedSearch" @keydown.enter="startSearch" />
      </label>
      <span class="fa-menubar__spacer"></span>
      <label class="fa-menubar__user">
        <input type="search" list="usernameList" :placeholder="galleryType ? 'Whose favorites?' : 'Filter by user'"
          v-model="username" @input="debouncedSearch" @change="startSearch" autocomplete="off" />
        <datalist id="usernameList">
          <option v-for="n in nameList" :value="n"></option>
        </datalist>
      </label>
    </nav>

    <div v-show="!submissionData" class="gallery-container">
      <div v-if="query.username" class="userpage-nav-header">
        <img class="userpage-nav-avatar" :src="avatarSrc(query.username)" @error="fixIcon" alt="" />
        <div class="userpage-nav-user-details">
          <div class="c-usernameBlock">
            <span class="c-usernameBlock__displayName">{{displayName}}</span>
            <span class="c-usernameBlock__userName">~{{query.username}}</span>
          </div>
          <div class="font-small">{{galleryType ? 'Favorites' : 'Gallery'}}<template v-if="query.searchTerm"> | matching "{{query.searchTerm}}"</template></div>
          <div class="userpage-nav-links">
            <a :class="{ current: !galleryType }" @click.prevent="showGallery('')" href="#">Gallery</a>
            <a :class="{ current: galleryType }" @click.prevent="showGallery('favorites')" href="#">Favs</a>
          </div>
        </div>
      </div>

      <div class="content-with-sidebar">
        <div class="content">
          <section class="gallery-section">
            <div class="section-body">
              <div class="gallery-page-title">
                <template v-if="!query.username">{{galleryType ? 'Favorites' : 'All Submissions'}}<template v-if="query.searchTerm"> matching "{{query.searchTerm}}"</template> | </template>Page #{{page}}
              </div>
              <div class="gallery" :class="{ nodesc: !showTitles, loading }">
                <gallery-tile v-for="result in results" :key="result.id" v-bind="result" :show-artist="!query.username || !!galleryType"
                  @load-submission="loadSubmission" @search-user="searchUser"></gallery-tile>
                <p v-if="!results.length && !loading" class="gallery-empty">{{emptyText}}</p>
              </div>
              <div class="gallery-navigation button-row">
                <button class="button" :disabled="!offset || loading" @click="previous(true)" title="Previous page (←)">« Prev</button>
                <button class="button" @click="toggleTitles">{{showTitles ? 'Disable Titles' : 'Enable Titles'}}</button>
                <button class="button" :disabled="!hasNext || loading" @click="next(true)" title="Next page (→)">Next »</button>
              </div>
            </div>
          </section>
        </div>

        <div class="sidebar sidebar--plain gallery-sidebar">
          <div>
            <h3 class="sidebar-folder-title">Gallery Folders</h3>
            <ul class="folder-list">
              <li><a href="#" :class="{ active: !galleryType }" @click.prevent="showGallery('')">Main Gallery</a></li>
              <li><a href="#" :class="{ active: galleryType }" @click.prevent="showGallery('favorites')">Favorites</a></li>
            </ul>
          </div>
          <div>
            <h3 class="sidebar-folder-title">Sort</h3>
            <ul class="folder-list">
              <li><a href="#" :class="{ active: sortOrder === 'DESC' }" @click.prevent="setSort('DESC')">Newest first</a></li>
              <li><a href="#" :class="{ active: sortOrder === 'ASC' }" @click.prevent="setSort('ASC')">Oldest first</a></li>
            </ul>
          </div>
          <div>
            <h3 class="sidebar-folder-title">Rating</h3>
            <ul class="folder-list rating-list">
              <li><label class="r-general"><input type="checkbox" v-model="ratingFilter.general" @change="filtersChanged"> General</label></li>
              <li><label class="r-mature"><input type="checkbox" v-model="ratingFilter.mature" @change="filtersChanged"> Mature</label></li>
              <li><label class="r-adult"><input type="checkbox" v-model="ratingFilter.adult" @change="filtersChanged"> Adult</label></li>
            </ul>
          </div>
          <div v-if="hasQuery">
            <button class="button" @click="clearFilters">Clear search</button>
          </div>
          <p class="font-small">Keys: ← → change page, / search</p>
        </div>
      </div>
    </div>

    <submission-view v-if="submissionData" v-bind="submissionData"
      :has-prev="hasPrevSubmission" :has-next="hasNextSubmission" :gallery-label="galleryLabel"
      @clear-submission="goBack" @download-comments="downloadComments" @download-content="downloadContent"
      @step="stepSubmission" @search-user="searchUser" @search-tag="searchTag"></submission-view>

    <footer class="fa-footer">
      FA Gallery Downloader DX | originally by SpottedSqueak, maintained by AlphaNeon | Not affiliated with Fur Affinity
    </footer>
  </div>
  `,
  data() {
    return {
      count: 28,
      offset: 0,
      results: [],
      loading: false,
      submissionData: null,
      query: {},
      search: '',
      username: '',
      galleryType: '',
      timer: null,
      sortOrder: 'DESC',
      ratingFilter: { general: true, mature: true, adult: true },
      favUsernames: [],
      usernames: [],
      galleryScroll: 0,
      showTitles: readTitles(),
    };
  },
  beforeCreate() {
    window.setPageInfo = (data) => {
      if (data.favUsernames) this.favUsernames = data.favUsernames;
      if (data.usernames) this.usernames = data.usernames;
    }
  },
  mounted() {
    history.replaceState('', null, location.href.split('#')[0]);
    this.getResults();
    window.addEventListener('hashchange', () => {
      if (!location.hash) this.clearSubmission();
    });
    window.addEventListener('keydown', (e) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      if (/input|select|textarea/i.test(document.activeElement?.tagName)) return;
      if (e.key === '/') {
        this.$refs.search.focus();
      } else if (this.submissionData) {
        if (e.key === 'Escape') this.goBack();
        else if (e.key === 'ArrowLeft' && this.hasPrevSubmission) this.stepSubmission(-1);
        else if (e.key === 'ArrowRight' && this.hasNextSubmission) this.stepSubmission(1);
        else return;
      } else {
        if (e.key === 'ArrowLeft' && this.offset) this.previous(true);
        else if (e.key === 'ArrowRight' && this.hasNext) this.next(true);
        else return;
      }
      e.preventDefault();
    });
  },
  computed: {
    page() {
      return Math.floor(this.offset / this.count) + 1;
    },
    hasNext() {
      return this.results.length >= this.count;
    },
    hasQuery() {
      return !!(this.search || this.username || this.galleryType);
    },
    nameList() {
      const names = this.galleryType ? this.favUsernames : this.usernames;
      return [...new Set(names.map(n => n.username))];
    },
    displayName() {
      const name = this.query.username;
      if (!this.galleryType) {
        const match = this.results.find(r => r.username === name || r.account_name === name);
        if (match?.pretty_name) return match.pretty_name;
      }
      return name;
    },
    galleryLabel() {
      if (this.query.username) return this.galleryType ? `Favorites of ${this.query.username}` : `Gallery of ${this.query.username}`;
      return this.galleryType ? 'Favorites' : 'All Submissions';
    },
    emptyText() {
      if (this.query.galleryType && !this.query.username) return 'Type a username in the box at the top right to see their favorites.';
      if (!this.ratingFilter.general && !this.ratingFilter.mature && !this.ratingFilter.adult) return 'All ratings are switched off. Tick at least one rating in the sidebar.';
      if (this.query.username || this.query.searchTerm) return 'There are no submissions matching this search.';
      return 'There are no submissions to list. Download a gallery first!';
    },
    currentIndex() {
      const id = this.submissionData?.submission?.id;
      return this.results.findIndex(r => String(r.id) === String(id));
    },
    hasPrevSubmission() {
      return this.currentIndex > 0 || (this.currentIndex === 0 && this.offset > 0);
    },
    hasNextSubmission() {
      return this.currentIndex !== -1 && (this.currentIndex < this.results.length - 1 || this.hasNext);
    },
  },
  methods: {
    avatarSrc(name) {
      return `https://a.furaffinity.net/${String(name).toLowerCase().replace(/_/g, '')}.gif`;
    },
    fixIcon(e) {
      e.target.src = '../html/resources/_default.gif';
    },
    toggleTitles() {
      this.showTitles = !this.showTitles;
      try { localStorage.setItem(TITLES_KEY, this.showTitles ? '1' : '0'); } catch { /* storage unavailable */ }
    },
    previous(scroll) {
      this.offset = Math.max(0, this.offset - this.count);
      return this.getResults(scroll);
    },
    next(scroll) {
      this.offset += this.count;
      return this.getResults(scroll);
    },
    setSort(order) {
      this.sortOrder = order;
      this.filtersChanged();
    },
    filtersChanged() {
      this.offset = 0;
      this.getResults();
    },
    async getResults(scroll) {
      this.loading = true;
      const payload = {
        offset: this.offset,
        count: this.count,
        query: this.query,
        sortOrder: this.sortOrder,
        ratingFilter: this.ratingFilter,
      };
      try {
        const results = await window.getGalleryPage(JSON.parse(JSON.stringify(payload)));
        this.results = (results || []).map(result => ({
          ...result,
          pretty_name: (result.pretty_username || '').trim() || result.username,
        }));
      } finally {
        this.loading = false;
      }
      if (scroll === true) window.scrollTo(0, 0);
    },
    async loadSubmission(id, noScroll) {
      if (!this.submissionData) this.galleryScroll = window.scrollY;
      const data = await window.getSubmissionPage(id);
      if (!data?.submission) return;
      const wasOpen = !!this.submissionData;
      this.submissionData = data;
      if (wasOpen) history.replaceState('', null, `#view/${id}`);
      else window.location.hash = `view/${id}`;
      if (!noScroll) window.scrollTo(0, 0);
    },
    async stepSubmission(dir) {
      let index = this.currentIndex + dir;
      if (index < 0) {
        await this.previous();
        index = this.results.length - 1;
      } else if (index >= this.results.length) {
        await this.next();
        index = 0;
      }
      const target = this.results[index];
      if (target) this.loadSubmission(target.id);
    },
    goBack() {
      window.history.back();
    },
    leaveSubmission() {
      if (this.submissionData) this.goBack();
    },
    clearSubmission() {
      this.submissionData = null;
      this.$nextTick(() => window.scrollTo(0, this.galleryScroll));
    },
    async downloadComments(id, url) {
      await window.downloadComments(id, url);
      this.loadSubmission(id, true);
    },
    async downloadContent({ id, content_url, content_name, account_name }) {
      await window.downloadContent({ content_url, content_name, account_name });
      this.loadSubmission(id, true);
      this.getResults();
    },
    debouncedSearch() {
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.startSearch(), 250);
    },
    startSearch() {
      clearTimeout(this.timer);
      this.query = { searchTerm: this.search.trim(), username: this.username.trim(), galleryType: this.galleryType };
      this.offset = 0;
      this.galleryScroll = 0;
      if (this.query.galleryType && !this.query.username) {
        this.results = [];
        return;
      }
      this.getResults();
    },
    showGallery(type) {
      this.leaveSubmission();
      this.galleryType = type;
      this.startSearch();
    },
    clearFilters() {
      this.search = '';
      this.username = '';
      this.galleryType = '';
      this.startSearch();
    },
    searchUser(username) {
      this.leaveSubmission();
      this.username = username;
      this.galleryType = '';
      this.startSearch();
    },
    searchTag(tag) {
      this.leaveSubmission();
      this.search = tag;
      this.startSearch();
    },
  }
}
