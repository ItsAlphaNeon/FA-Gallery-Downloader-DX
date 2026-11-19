import getRelativeTime from './relative-time.js';

// One thumbnail, laid out like a <figure> in FA's gallery (section.gallery figure).
export default {
  name: 'gallery-tile',
  template: `
    <figure :class="['r-' + ratingClass, { 'with-artist': showArtist }]">
      <b><u>
        <a href="#" @click.prevent="loadSubmission" :title="title">
          <div v-if="error" class="gallery-tile__placeholder">⚠ Error!<br>Possibly<br>corrupt file</div>
          <img v-else-if="isImg" :src="computedImgPath" loading="lazy" alt="" @load="onImgLoad" @error="onError"/>
          <div v-else-if="!is_content_saved" class="gallery-tile__placeholder">Not downloaded<br><span>{{fileExtension}}</span></div>
          <div v-else class="gallery-tile__placeholder file-type"><span>{{fileExtension}}</span></div>
        </a>
      </u></b>
      <figcaption>
        <p><a href="#" @click.prevent="loadSubmission" :title="title">{{title}}</a></p>
        <p v-if="showArtist"><i>by</i> <a href="#" @click.prevent="searchUser" :title="pretty_username">{{pretty_username}}</a></p>
        <p class="gallery-tile__date" :title="dateTitle">{{relativeDate}}</p>
      </figcaption>
    </figure>
  `,
  props: ['id', 'title', 'username', 'pretty_name', 'account_name', 'content_name', 'date_uploaded', 'uploaded_at', 'is_content_saved', 'thumbnail_name', 'is_thumbnail_saved', 'rating', 'showArtist'],
  emits: ['loadSubmission', 'searchUser'],
  data() {
    return {
      contentPath: '',
      error: false,
      isDefaultThumbnail: false,
    };
  },
  beforeMount() {
    this.getContentPath();
    this.error = false;
  },
  computed: {
    cleanAccountName() {
      return this.account_name.replace(/\.$/, '._');
    },
    pretty_username() {
      return this.pretty_name && this.pretty_name.trim() !== '' ? this.pretty_name : this.username;
    },
    isImg() {
      return (
        this.contentPath &&
        this.is_content_saved &&
        (/(png|jpg|gif|webp|jpeg)$/i.test(this.content_name) || this.isThumbnail) &&
        !this.isDefaultThumbnail
      );
    },
    isThumbnail() {
      return this.thumbnail_name && this.is_thumbnail_saved;
    },
    computedImgPath() {
      const base = this.contentPath;
      const account = this.cleanAccountName;
      if (this.thumbnail_name && this.is_thumbnail_saved) {
        return `${base}/${account}/thumbnail/${this.thumbnail_name}`;
      }
      return `${base}/${account}/${this.content_name}`;
    },
    fileExtension() {
      const fileExtension = this.content_name.split('.').pop().toUpperCase();
      return fileExtension ? fileExtension : '???';
    },
    relativeDate() {
      return getRelativeTime(this.uploaded_at ? this.uploaded_at * 1000 : +new Date(this.date_uploaded));
    },
    dateTitle() {
      return this.uploaded_at ? new Date(this.uploaded_at * 1000).toLocaleString() : this.date_uploaded;
    },
    ratingClass() {
      return this.rating?.toLowerCase() || 'general';
    }
  },
  methods: {
    async getContentPath() {
      this.contentPath = await window.getContentPath();
    },
    async onImgLoad(l) {
      this.error = false;
      const img = l.target;
      if (!img.clientWidth) {
        await this.waitFor();
        return this.onImgLoad({ target: img });
      }
      this.isDefaultThumbnail = img.naturalWidth === 50 && img.naturalHeight === 50;
    },
    onError() {
      this.error = true;
    },
    loadSubmission() {
      this.$emit('loadSubmission', this.id);
    },
    searchUser() {
      this.$emit('searchUser', this.username);
    },
    waitFor(t = 1000) {
      return new Promise(r => setTimeout(r, t));
    }
  },
}
