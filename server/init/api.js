import moment from 'moment';
import { createRedisClient, redisConfig } from '../redis';
import { cachedApi } from '../redis/cachedGet';
import { submitForm } from './gravitySubmit';
import { appSettings, gravityForms, wp } from '../../graphQL';
import { serversideStateCharacterBlacklistRegex, WP_URL, REDIS_PREFIX } from '../config/app';

/* ----------- App API Helpers ----------- */
const client = createRedisClient(REDIS_PREFIX);

/* Removes illegal characters from WP API */
/* Checks for WP_URL in response and replaces it with the base url */
/* Reinstates correct wp-content links within response */
const sanitizeJSONCurry = ({returnJson}) => (json) => {
  const stringified = JSON.stringify(json);
  const wpUrlRegex = new RegExp(WP_URL, 'g');
  const wpContentUrlRegex = new RegExp('/wp-content', 'g');
  const cleaned = stringified
  .replace(serversideStateCharacterBlacklistRegex, '')
  .replace(wpUrlRegex, '')
  .replace(wpContentUrlRegex, `${WP_URL}/wp-content`);
  return returnJson ? JSON.parse(cleaned) : cleaned;
};

const sanitizeJSONasString = sanitizeJSONCurry({returnJson: false});

const handleCachedSuccess = ({sanitizedData, res}) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(sanitizedData);
};

const handleCachedError = ({res, error}) => {
  res.json(error);
};

const cachedApiInstance = cachedApi({
  expiry: redisConfig.redisLongExpiry,
  redisCache: client,
  sanitizeJSON: sanitizeJSONasString,
});

/* ----------- Express ----------- */

export default(app) => {
  const appCached = cachedApiInstance({app});
  /* ----------- App API Routes ----------- */
  /* Get Site Name and Description */
  /* Does not require a query param */
  appCached.get('/api/settings', (req, res) =>
    appSettings(`
      query{
        settings{
          name,
          emailAddress,
          phoneNumber,
          faxNumber,
          officeAddress,
          socialLinks,
          trackingType,
          trackingId,
          googleMapsApiKey,
          additionalScripts
        }
      }
    `), handleCachedSuccess, handleCachedError);

  /* Get Menu */
  /* Expects query param ?name= (?name=Header) */
  appCached.get('/api/menu', (req, res) =>
    appSettings(`
      query get_menu($name: String) {
        menu(name: $name) {
          title,
          url,
          order,
          classes,
          children{
            title,
            url,
            order,
            classes
          }
        }
      }`, {name: req.query.name}), handleCachedSuccess, handleCachedError);

  /* ----------- Wordpress API Routes ----------- */
  /* Get Page */
  /* Expects query param ?slug= */
  appCached.get('/api/page', (req, res) =>
    wp(`
      query get_page($slug: String, $preview: Int) {
        active_page: page(slug: $slug, preview: $preview) {
          title,
          content,
          slug,
          link,
          featuredImage{
            alt,
            url,
            sizes
          },
          acf,
          seo: yoast
        }
      }`, {slug: req.query.slug, preview: req.query.preview}), handleCachedSuccess, handleCachedError);

  /* Get Collection of Posts */
  /* Expects query param ?page= */
  appCached.get('/api/posts', (req, res) =>
    wp(`
      query get_posts($page: Int, $perPage: Int) {
        posts(page: $page, perPage: $perPage) {
          items{
            slug,
            title,
            content,
            featuredImage{
              alt,
              url,
              sizes
            },
            acf,
            categories{
              name,
              slug
            },
            author{
              name,
              avatar
            }
          }
          categories{
            slug,
            name,
            parent,
            count
          }
          totalItems,
          totalPages
        }
      }`, {page: req.query.page, perPage: req.query.perPage}), handleCachedSuccess, handleCachedError);

  /* Get Individual Post */
  /* Expects query param ?slug= */
  appCached.get('/api/post', (req, res) =>
    wp(`
      query get_post($slug: String, $preview: Int) {
        activePost: post(slug: $slug, preview: $preview){
          slug,
          title,
          content,
          date,
          acf,
          link,
          pagination{
            next{
              slug,
              title,
              date,
              featuredImage{
                alt,
                url,
                sizes
              }
            },
            previous{
              slug,
              title,
              date,
              featuredImage{
                alt,
                url,
                sizes
              }
            },
          },
          featuredImage{
            alt,
            url,
            sizes
          },
          categories{
            name,
            slug
          },
          author{
            name,
            slug,
            avatar
          }
        }
      }`, {slug: req.query.slug, preview: req.query.preview}), handleCachedSuccess, handleCachedError);

  /* Get Category and Collection of Posts */
  /* Expects query param ?slug= && ?page= */
  appCached.get('/api/category', (req, res) =>
    wp(`
      query get_category($slug: String, $page: Int) {
        category(slug: $slug) {
          details{
            slug,
            name,
            description,
            id
          }
          posts(page: $page){
            items{
              slug,
              title,
              content,
              featuredImage{
                alt,
                url,
                sizes
              },
              acf,
              categories{
                name,
                slug
              },
              author{
                name,
                avatar
              }
            },
            totalItems,
            totalPages
          }
        }
      }`, {slug: req.query.slug, page: req.query.page}), handleCachedSuccess, handleCachedError);

  /* Get Author and Collection of Posts */
  /* Expects query param ?name && ?page= */
  appCached.get('/api/author', (req, res) =>
    wp(`
      query get_author($name: String, $page: Int) {
        author(name: $name) {
          details{
            slug,
            name,
            id
          }
          posts(page: $page){
            items{
              slug,
              title,
              content,
              featuredImage{
                alt,
                url,
                sizes
              },
              acf,
              categories{
                name,
                slug
              },
              author{
                name,
                avatar
              }
            },
            totalItems,
            totalPages
          }
        }
      }`, {name: req.query.name, page: req.query.page}), handleCachedSuccess, handleCachedError);

  /* Perform search and return results */
  /* Expects query param ?term= (OPTIONAL = ?type= && ?page= && ?perPage=) */
  appCached.get('/api/search', (req, res) =>
    wp(`
      query search($term: String, $type: String, $page: Int, $perPage: Int) {
        search(term: $term, type: $type, page: $page, perPage: $perPage) {
          items{
            slug,
            title,
            content,
            featuredImage{
              alt,
              url,
              sizes
            },
            acf,
            categories{
              name,
              slug
            },
            author{
              name,
              avatar
            }
          },
          totalItems,
          totalPages
        }
      }`, {term: req.query.term, type: req.query.type, page: req.query.page, perPage: req.query.perPage})
        , handleCachedSuccess, handleCachedError);

  /* ----------- Gravity Forms Endpoints ----------- */
  /* Get Gravity Form */
  /* Expects query param ?id= */
  appCached.get('/api/gravityforms', (req, res) =>
    gravityForms(`
      query get_form($id: Int) {
        form(id: $id) {
          title,
          description,
          button,
          confirmation,
          fields{
            type,
            id,
            label,
            placeholder,
            classes: cssClass,
            required: isRequired,
            prePopulated,
            prePopulatedParam,
            choices
          }
        }
      }`, {id: req.query.id}), handleCachedSuccess, handleCachedError);

  app.post('/api/gravityforms', (req, res) => {
    return submitForm(req, res);
  });

  /* ----------- Redis Endpoints ----------- */
  /* Flush Redis */
  app.get('/api/flushredis', (req, res) => {
    console.log(`${moment().format()} flushing Redis cache`);
    client.flushdb(err => {
      if (err) return res.json({error: err});
      return res.json({success: true});
    });
  });
};
