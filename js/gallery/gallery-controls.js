export default {
  name: 'gallery-controls',
  emits: ['startSearch', 'filtersChanged'],
  props: ['outsideUsername', 'outsideSearch', 'outsideFavUsernames', 'outsideUsernames', 'ratingFilter', 'sortOrder'],
  template: `
    <div class="gallery-controls">
      <div class="gallery-controls__group gallery-controls__type" role="tablist">
        <button type="button" :class="{ active: !galleryType }" @click="setType('')">Gallery</button>
        <button type="button" :class="{ active: galleryType }" @click="setType('favorites')">Favorites</button>
      </div>
      <div class="gallery-controls__group gallery-controls__field">
        <label for="username">User</label>
        <input id="username" list="usernameList" type="search" :placeholder="galleryType ? 'Whose favorites?' : 'Any user'"
          v-model="username" @input="debouncedSearch" @change="startSearch" autocomplete="off" />
        <datalist id="usernameList">
          <option v-for="n in listInfo" :value="n"></option>
        </datalist>
      </div>
      <div class="gallery-controls__group gallery-controls__field gallery-controls__search">
        <label for="search">Search</label>
        <input id="search" ref="search" type="search" placeholder="Title, tags, description ( / )"
          v-model="search" @input="debouncedSearch" />
      </div>
      <div class="gallery-controls__group rating-filter-container">
        <span class="gallery-controls__label">Rating</span>
        <label class="chip general"><input type="checkbox" v-model="ratingFilter.general" @change="$emit('filtersChanged')"> General</label>
        <label class="chip mature"><input type="checkbox" v-model="ratingFilter.mature" @change="$emit('filtersChanged')"> Mature</label>
        <label class="chip adult"><input type="checkbox" v-model="ratingFilter.adult" @change="$emit('filtersChanged')"> Adult</label>
      </div>
      <div class="gallery-controls__group">
        <label for="sort-order">Sort</label>
        <select id="sort-order" :value="sortOrder" @change="$emit('filtersChanged', $event.target.value)">
          <option value="DESC">Newest first</option>
          <option value="ASC">Oldest first</option>
        </select>
      </div>
      <button v-if="hasQuery" type="button" class="small clear-btn" @click="clear">✖ Clear</button>
    </div>
  `,
  data() {
    return {
      search: '',
      username: '',
      galleryType: '',
      favUsernames: [],
      usernames: [],
      timer: null,
    };
  },
  mounted() {
    this.onKey = (e) => {
      if (e.key === '/' && !/input|select|textarea/i.test(document.activeElement?.tagName)) {
        e.preventDefault();
        this.$refs.search.focus();
      }
    };
    window.addEventListener('keydown', this.onKey);
  },
  unmounted() {
    window.removeEventListener('keydown', this.onKey);
  },
  watch: {
    outsideUsername(newName) {
      this.username = newName.name;
      this.galleryType = '';
      this.startSearch();
    },
    outsideSearch(term) {
      this.search = term.term;
      this.startSearch();
    },
    outsideFavUsernames(newNames) {
      this.favUsernames = newNames;
    },
    outsideUsernames(newNames) {
      this.usernames = newNames;
    }
  },
  computed: {
    listInfo() {
      let names = this.galleryType ? this.favUsernames : this.usernames;
      return [...new Set(names.map(n => n.username))];
    },
    hasQuery() {
      return !!(this.search || this.username || this.galleryType);
    },
  },
  methods: {
    setType(type) {
      this.galleryType = type;
      this.startSearch();
    },
    debouncedSearch() {
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.startSearch(), 250);
    },
    clear() {
      this.search = '';
      this.username = '';
      this.galleryType = '';
      this.startSearch();
    },
    startSearch() {
      clearTimeout(this.timer);
      const searchTerm = this.search.trim();
      const username = this.username.trim();
      const galleryType = this.galleryType;
      this.$emit('startSearch', { searchTerm, username, galleryType });
    }
  },
}
