import getRelativeTime from './relative-time.js';

export default {
  name: 'submission-view',
  template: `
    <div class="submission-view">
      <nav class="submission-toolbar">
        <button class="close-btn" @click="close" title="Back to the gallery (Esc)">‹ Back to gallery</button>
        <div class="submission-toolbar__steps">
          <button :disabled="!hasPrev" @click="$emit('step', -1)" title="Previous submission (←)">← Prev</button>
          <button :disabled="!hasNext" @click="$emit('step', 1)" title="Next submission (→)">Next →</button>
        </div>
        <div class="submission-toolbar__links">
          <button class="full-size-btn" :disabled="!isDownloadable" @click="openInNewWindow">View full size</button>
          <button v-if="submission.url" @click="openOnFa">View on FA ↗</button>
        </div>
      </nav>
      <div class="submission-container">
        <div class="submission-hero">
          <div v-if="error" class="download-link" @click="downloadContent">File possibly corrupted!<br>Redownload?</div>
          <img v-else-if="isImg" :src="computedContentPath" @click.self="openInNewWindow" :alt="altText" :title="altText" @error="error = true" />
          <object v-else-if="isPDF" class="pdf-embed" :data="computedContentPath" type="application/pdf" @error="error = true"></object>
          <object v-else-if="isSWF" class="swf-embed" type="application/x-shockwave-flash" :data="computedContentPath" id="applicationID">
            <param name="movie" :value="computedContentPath" />
            <param name="wmode" value="transparent" />
            <param name="FlashVars" value="" />
            <param name="quality" value="high" />
            <param name="menu" value="false" />
          </object>
          <object v-else-if="isTxt" class="pdf-embed txt" :data="computedContentPath" type="text/plain" @error="error = true"></object>
          <audio v-else-if="isMusic" class="music-embed" controls :src="computedContentPath" @error="error = true"></audio>
          <div v-else-if="isDoc" class="download-link" @click="openInNewWindow">Content not embedded. Download to view!</div>
          <div v-else-if="isUnknown" class="music-embed">Invalid/Blank filetype: "{{submission.content_name}}"<br>This file cannot be displayed or downloaded, due to it's missing filetype</div>
          <div v-else-if="isMissing" class="music-embed">Content missing: "{{submission.content_name}}"<br>This file cannot be downloaded, as it is missing on FA</div>
          <div v-else-if="isDownloadable" class="music-embed">Content: "{{submission.content_name}}" not displayable</div>
          <div v-else class="download-link" @click="downloadContent">Content not downloaded!<br>Download now?</div>
        </div>
        <aside class="submission-metadata">
          <div class="submission-info__header">
            <div class="submission-info__user-icon">
              <img :src="getCleanUserImg(submission.username)" @error="fixIcon" alt=""/>
            </div>
            <div>
              <h2 class="submission-info__title">{{submission.title}}</h2>
              <div class="submission-info__user">
                by <a href="#" @click.prevent="$emit('searchUser', submission.username)" title="Show only this user">{{submission.pretty_username || submission.username}}</a>
              </div>
            </div>
          </div>
          <dl class="submission-metadata__info">
            <dt>Uploaded</dt>
            <dd :title="dateUploaded">{{relativeDate}}<br><small>{{dateUploaded}}</small></dd>
            <dt>Rating</dt>
            <dd><span class="rating-badge" :class="[cleanRating]">{{submission.rating || '[Missing]'}}</span></dd>
            <dt>Category</dt>
            <dd>{{submission.category || '[Missing]'}}</dd>
            <dt>File</dt>
            <dd class="submission-metadata__file" :title="submission.content_name">{{submission.content_name}}</dd>
          </dl>
          <h3>Tags</h3>
          <ul v-if="cleanTags.length" class="submission-metadata__tags">
            <li v-for="tag in cleanTags" :key="tag">
              <a href="#" @click.prevent="$emit('searchTag', tag)" title="Search for this tag">{{tag}}</a>
            </li>
          </ul>
          <div v-else class="muted">No tags</div>
        </aside>
        <section class="submission-info">
          <div class="submission-info__desc" v-html="cleanDesc" @click="possibleOpen"></div>
        </section>
      </div>
      <section class="comments-section">
        <div class="comments-header">
          <h3>Comments <span class="count">{{comments?.length || 0}}</span></h3>
          <button class="download-comments" :disabled="downloadingComments" @click="downloadComments">
            {{downloadingComments ? 'Downloading...' : comments?.length ? 'Refresh comments' : 'Download comments'}}
          </button>
        </div>
        <p v-if="!comments?.length" class="muted">No comments saved for this submission.</p>
        <div class="comment-container">
          <div v-for="comment in comments" :key="comment.id" class="comment" :style="comment.width">
            <div class="comment-icon"><img :src="getCleanUserImg(comment.username)" @error="fixIcon" alt="" /></div>
            <div class="comment-header">
              <div class="comment-user">
                {{getCleanUsername(comment.username)}}
                <span :title="getCommentTitle(comment)">{{getCommentDate(comment)}}</span>
              </div>
              <div class="comment-subtitle">{{comment.subtitle}}</div>
            </div>
            <div class="comment-desc" v-html="getCleanDesc(comment.desc)" @click="possibleOpen"></div>
          </div>
        </div>
      </section>
    </div>
  `,
  props: ['submission', 'comments', 'hasPrev', 'hasNext'],
  emits: ['clearSubmission', 'downloadComments', 'downloadContent', 'step', 'searchUser', 'searchTag'],
  data() {
    return {
      contentPath: '',
      altText: 'Click to open in a new tab!',
      error: false,
      downloadingComments: false,
    };
  },
  beforeMount() {
   this.getContentPath();
  },
  watch: {
    submission() {
      this.error = false;
      this.downloadingComments = false;
    }
  },
  computed: {
    isImg() {
      return (
        this.contentPath
        && this.submission.is_content_saved
        && /(png|jpg|gif|webp|jpeg)$/i.test(this.submission.content_name)
      );
    },
    isPDF() {
      return (
        this.contentPath
        && this.submission.is_content_saved
        && /(pdf)$/i.test(this.submission.content_name)
      );
    },
    isTxt() {
      return (
        this.contentPath
        && this.submission.is_content_saved
        && /(text|txt|rtf)$/i.test(this.submission.content_name)
      );
    },
    isDoc() {
      return (
        this.contentPath
        && this.submission.is_content_saved
        && /(doc|docx)$/i.test(this.submission.content_name)
      );
    },
    isMusic() {
      return (
        this.contentPath
        && this.submission.is_content_saved
        && /(mp3|wav|ogg)$/i.test(this.submission.content_name)
      );
    },
    isSWF() {
      return (
        this.contentPath
        && this.submission.is_content_saved
        && /(swf)$/i.test(this.submission.content_name)
      );
    },
    isUnknown() {
      return /\.$/i.test(this.submission.content_name);
    },
    isMissing() {
      return !!this.submission.content_missing;
    },
    isDownloadable() {
      return this.submission.is_content_saved &&
        !(this.isUnknown && this.isMissing);
    },
    cleanAccountName() {
      return this.submission.account_name.replace(/\.$/, '._');
    },
    computedContentPath() {
      return `${this.contentPath}\\${this.cleanAccountName}\\${this.submission.content_name}`;
    },
    fileExtension() {
      return this.submission.content_name.split('.').pop();
    },
    relativeDate() {
      const { uploaded_at, date_uploaded } = this.submission;
      return getRelativeTime(uploaded_at ? uploaded_at * 1000 : +new Date(date_uploaded));
    },
    dateUploaded() {
      const { uploaded_at, date_uploaded } = this.submission;
      return uploaded_at ? new Date(uploaded_at * 1000).toLocaleString() : date_uploaded;
    },
    cleanDesc() {
      return this.getCleanDesc(this.submission.desc);
    },
    cleanTags() {
      return this.submission.tags?.split(',') || [];
    },
    cleanRating() {
      return this.submission.rating?.toLowerCase() || '';
    }
  },
  methods: {
    getCleanUsername(name) {
      return name.replace(/\bOP\b/gi, ' [OP] ');
    },
    getCleanUserImg(name) {
      const cleanName = name.split(' ')[0].toLowerCase().replace(/[_]/g, '');
      return `https://a.furaffinity.net/${cleanName}.gif`;
    },
    getCleanDesc(desc = '') {
      return desc
        .replace(/"\/\//gi, '"https://')
        .replace(/"\/user/gi, '"https://www.furaffinity.net/user')
        .replace(/img src/gi, `img onerror='this.src="../html/resources/_default.gif"' src`);
    },
    getCommentDate({ date, posted_at }) {
      if (posted_at) return getRelativeTime(posted_at * 1000);
      if (!date) return '';
      return getRelativeTime(+new Date(date));
    },
    getCommentTitle({ date, posted_at }) {
      return posted_at ? new Date(posted_at * 1000).toLocaleString() : date;
    },
    async getContentPath() {
      this.contentPath = await window.getContentPath();
    },
    close() {
      this.$emit('clearSubmission');
    },
    downloadComments() {
      const { id, url } = this.submission;
      this.downloadingComments = true;
      this.$emit('downloadComments', id, url);
    },
    openOnFa() {
      window.openUrl?.(this.submission.url);
    },
    downloadContent() {
      this.$emit('downloadContent', this.submission);
    },
    openInNewWindow() {
      window.open(this.computedContentPath, '_blank');
    },
    fixIcon(e) {
      e.target.src = '../html/resources/_default.gif';
    },
    possibleOpen(e) {
      const link = e.target.closest('a');
      if (!link) return;
      e.preventDefault();
      if (link.href) window.openUrl?.(link.href);
    }
  },
}
