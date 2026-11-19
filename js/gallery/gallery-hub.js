import galleryTile from "./gallery-tile.js";
import submissionView from './submission-view.js';
import galleryControls from './gallery-controls.js';

export default {
  name: 'gallery-hub',
  components: {
    galleryTile,
    submissionView,
    galleryControls,
  },
  template: `
  <div class="gallery-wrapper">
    <div v-show="!submissionData" class="gallery-container">
      <header class="gallery-header">
        <h2 class="gallery-title">🐾 FA Gallery Viewer 🐾</h2>
        <gallery-controls @start-search="startSearch" @filters-changed="filtersChanged"
          :outside-username="outsideUsername" :outside-search="outsideSearch"
          :outside-fav-usernames="favUsernames" :outside-usernames="usernames"
          :rating-filter="ratingFilter" :sort-order="sortOrder"></gallery-controls>
      </header>
      <div class="gallery-navigation">
        <h3 class="gallery-search-title">{{galleryTitle}}</h3>
        <div class="pager">
          <button class="gallery-prev" :disabled="!offset || loading" @click="previous" title="Previous page (←)">‹ Prev</button>
          <span class="pager__page">Page {{page}}</span>
          <button class="gallery-next" :disabled="!hasNext || loading" @click="next" title="Next page (→)">Next ›</button>
        </div>
      </div>
      <div class="gallery-results-container" :class="{ loading }">
        <gallery-tile v-for="result in results" :key="result.id" v-bind="result"
          @load-submission="loadSubmission" @search-user="searchUser"></gallery-tile>
        <div v-if="!results.length && !loading" class="gallery-empty">
          <p>{{emptyText}}</p>
        </div>
      </div>
      <div v-if="hasNext || offset" class="gallery-navigation gallery-navigation--bottom">
        <div class="pager">
          <button class="gallery-prev" :disabled="!offset || loading" @click="previous(true)">‹ Prev</button>
          <span class="pager__page">Page {{page}}</span>
          <button class="gallery-next" :disabled="!hasNext || loading" @click="next(true)">Next ›</button>
        </div>
      </div>
    </div>
    <submission-view v-if="submissionData" v-bind="submissionData"
      :has-prev="hasPrevSubmission" :has-next="hasNextSubmission"
      @clear-submission="goBack" @download-comments="downloadComments" @download-content="downloadContent"
      @step="stepSubmission" @search-user="searchUser" @search-tag="searchTag"></submission-view>
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
      outsideUsername: null,
      outsideSearch: null,
      sortOrder: 'DESC',
      ratingFilter: { general: true, mature: true, adult: true },
      favUsernames: [],
      usernames: [],
      galleryScroll: 0,
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
      if (this.submissionData) {
        if (e.key === 'Escape') this.goBack();
        else if (e.key === 'ArrowLeft' && this.hasPrevSubmission) this.stepSubmission(-1);
        else if (e.key === 'ArrowRight' && this.hasNextSubmission) this.stepSubmission(1);
        else return;
      } else {
        if (e.key === 'ArrowLeft' && this.offset) this.previous();
        else if (e.key === 'ArrowRight' && this.hasNext) this.next();
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
    galleryTitle() {
      const { username, galleryType, searchTerm } = this.query;
      if (galleryType && !username) return 'Favorites';
      let title = galleryType ? `Favorites of "${username}"` : username ? `Gallery of "${username}"` : 'All submissions';
      if (searchTerm) title += ` matching "${searchTerm}"`;
      return title;
    },
    emptyText() {
      if (this.query.galleryType && !this.query.username) return 'Enter a username to see their favorites.';
      if (!this.ratingFilter.general && !this.ratingFilter.mature && !this.ratingFilter.adult) return 'All ratings are switched off. Tick at least one rating above.';
      if (this.query.username || this.query.searchTerm) return 'Nothing matches. Try a different search or clear the filters.';
      return 'Nothing downloaded yet.';
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
    previous(scroll) {
      this.offset = Math.max(0, this.offset - this.count);
      return this.getResults(scroll);
    },
    next(scroll) {
      this.offset += this.count;
      return this.getResults(scroll);
    },
    filtersChanged(sortOrder) {
      if (sortOrder) this.sortOrder = sortOrder;
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
    async startSearch(query) {
      this.query = query;
      this.offset = 0;
      if (this.query.galleryType && !this.query.username) {
        this.results = [];
        return;
      }
      this.getResults();
    },
    searchUser(username) {
      if (this.submissionData) this.goBack();
      this.outsideUsername = { name: username };
    },
    searchTag(tag) {
      if (this.submissionData) this.goBack();
      this.outsideSearch = { term: tag };
    },
  }
}
