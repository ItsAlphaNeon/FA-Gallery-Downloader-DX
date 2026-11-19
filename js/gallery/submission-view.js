import getRelativeTime from './relative-time.js';

// A single submission, laid out like FA's submission page (image + description on the left,
// stats / info / keywords sidebar on the right, comments underneath).
export default {
  name: 'submission-view',
  template: `
    <div class="submission-view" id="submission_page">
      <div class="content-with-sidebar">
        <div class="content">
          <div class="submission-area">
            <div v-if="error" class="download-link" @click="downloadContent">File possibly corrupted!<br>Redownload?</div>
            <img v-else-if="isImg" id="submissionImg" :src="computedContentPath" @click.self="openInNewWindow" :title="altText" @error="error = true" />
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

          <div class="submission-options button-row">
            <button class="button" :disabled="!isDownloadable" @click="openInNewWindow">Full Size</button>
            <button class="button" @click="downloadContent">{{submission.is_content_saved ? 'Re-download' : 'Download'}}</button>
            <button v-if="submission.url" class="button" @click="openOnFa">View on FA</button>
          </div>

          <div class="minigallery-navigation">
            <a v-if="hasPrev" href="#" class="minigallery-navigation__step" @click.prevent="$emit('step', -1)" title="Previous submission (←)">« Prev</a>
            <span v-else class="minigallery-navigation__step"></span>
            <a href="#" class="minigallery-navigation__box" @click.prevent="close" title="Back to the gallery (Esc)">
              <b class="highlight">{{galleryLabel}}</b>
              <i>Back to gallery</i>
            </a>
            <a v-if="hasNext" href="#" class="minigallery-navigation__step" @click.prevent="$emit('step', 1)" title="Next submission (→)">Next »</a>
            <span v-else class="minigallery-navigation__step"></span>
          </div>

          <section class="submission-description">
            <div class="section-header submission-description-header">
              <a href="#" class="submission-description-artist" @click.prevent="$emit('searchUser', submission.username)" title="Show this artist's gallery">
                <img class="submission-user-icon" :src="getCleanUserImg(submission.username)" @error="fixIcon" alt=""/>
              </a>
              <div>
                <div class="submission-title"><h2>{{submission.title}}</h2></div>
                <div>
                  by <a href="#" class="c-usernameBlockSimple" @click.prevent="$emit('searchUser', submission.username)">{{submission.pretty_username || submission.username}}</a>
                </div>
                <div>Posted <span class="popup_date" :title="dateUploaded">{{relativeDate}}</span></div>
              </div>
            </div>
            <div class="section-body">
              <div class="submission-description-text user-submitted-links" v-html="cleanDesc" @click="possibleOpen"></div>
            </div>
          </section>

          <div class="comments-list">
            <div v-for="comment in comments" :key="comment.id" class="comment_container" :style="comment.width">
              <div class="comment-container">
                <div class="avatar"><img class="comment_useravatar" :src="getCleanUserImg(comment.username)" @error="fixIcon" alt="" /></div>
                <div class="comment-content">
                  <div class="comment-username">
                    <span class="c-usernameBlock__displayName">{{getCleanUsername(comment.username)}}</span>
                    <span class="c-usernameBlock__userName">~{{comment.account_name || comment.username}}</span>
                  </div>
                  <div class="comment-date font-small"><span class="popup_date" :title="getCommentTitle(comment)">{{getCommentDate(comment)}}</span></div>
                  <div v-if="comment.subtitle" class="comment-title font-small">{{comment.subtitle}}</div>
                  <div class="comment-user-text" v-html="getCleanDesc(comment.desc)" @click="possibleOpen"></div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="sidebar submission-sidebar">
          <div class="stats-box submission-page-stats">
            <div><div>{{comments?.length || 0}}</div><div class="highlight">Comments</div></div>
            <div><div>{{fileExtension.toUpperCase() || '?'}}</div><div class="highlight">File type</div></div>
            <div><div :class="'rating-text ' + cleanRating">{{submission.rating || '?'}}</div><div class="highlight">Rating</div></div>
          </div>

          <div class="button-row">
            <button class="button" @click="close" title="Back to the gallery (Esc)">Back</button>
            <button class="button" :disabled="!hasPrev" @click="$emit('step', -1)" title="Previous submission (←)">« Prev</button>
            <button class="button" :disabled="!hasNext" @click="$emit('step', 1)" title="Next submission (→)">Next »</button>
          </div>

          <dl class="info-table submission-content-stats">
            <dt>Category</dt><dd>{{submission.category || '-'}}</dd>
            <dt>Posted</dt><dd :title="dateUploaded">{{dateUploaded}}</dd>
            <dt>Artist</dt><dd>{{submission.pretty_username || submission.username}}</dd>
            <dt>File</dt><dd :title="submission.content_name">{{submission.content_name}}</dd>
          </dl>

          <div class="submission-tags">
            <div class="sidebar-heading">Keywords</div>
            <div v-if="cleanTags.length" class="tags-list">
              <span v-for="tag in cleanTags" :key="tag" class="tags"><span class="tag-block">+</span><a href="#" @click.prevent="$emit('searchTag', tag)" title="Search for this keyword">{{tag}}</a></span>
            </div>
            <div v-else class="font-small sidebar-empty">No keywords</div>
          </div>

          <div class="submission-comment-options">
            <div class="sidebar-heading">Comments</div>
            <div class="button-row">
              <button class="button" :disabled="downloadingComments" @click="downloadComments">
                {{downloadingComments ? 'Downloading...' : comments?.length ? 'Refresh Comments' : 'Download Comments'}}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  props: ['submission', 'comments', 'hasPrev', 'hasNext', 'galleryLabel'],
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
      return this.submission.content_name?.split('.').pop() || '';
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
      return this.submission.tags?.split(',').filter(Boolean) || [];
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
