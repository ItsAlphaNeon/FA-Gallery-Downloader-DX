import getRelativeTime from './relative-time.js';

export default {
  name: 'gallery-tile',
  template: `
    <div class="gallery-tile">
      <div class="gallery-tile__thumbnail" :class="[classRating]" @click="loadSubmission" :title="altText">
        <img v-if="isImg" class="gallery-tile__blur-bg" :src="computedImgPath" aria-hidden="true" />
        <div class="gallery-tile__thumbnail_wrapper">
          <div v-if="error" class="gallery-tile__thumbnail-other">⚠ ERROR! ⚠<br>Possible<br>corrupt file!</div>
          <img v-else-if="isImg" :src="computedImgPath" loading="lazy" alt="" @load="onImgLoad" @error="onError"/>
          <div v-else-if="!is_content_saved" class="gallery-tile__thumbnail-other not-downloaded"><span>File not downloaded!<br>Type: {{fileExtension}}</span></div>
          <div v-else class="gallery-tile__thumbnail-other file-type"><span>Filetype:<br>{{fileExtension}}</span></div>
        </div>
      </div>
      <div class="gallery-tile__info">
        <a href="#" class="gallery-tile__title" @click.prevent="loadSubmission" :title="title">{{title}}</a>
        <div class="gallery-tile__meta">
          <span class="gallery-tile__user">by <a href="#" @click.prevent="searchUser" :title="userAltText">{{pretty_username}}</a></span>
          <span class="gallery-tile__date" :title="dateTitle">{{relativeDate}}</span>
        </div>
      </div>
    </div>
  `,
  props: ['id', 'title', 'username', 'pretty_name', 'account_name', 'content_name', 'date_uploaded', 'uploaded_at', 'is_content_saved', 'thumbnail_name', 'is_thumbnail_saved', 'rating'],
  emits: ['loadSubmission', 'searchUser'],
  data() {
    return {
      contentPath: '',
      altText: 'View this submission!',
      userAltText: 'Show only this user',
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
      // Use forward slash to join the URL parts
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
    classRating() {
      return this?.rating?.toLowerCase();
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
      this.isDefaultThumbnail = img.clientWidth === 50 && img.clientHeight === 50;
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
