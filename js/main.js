;(function() {
 
  var MAX_COLS = url.tsq == 'tower' ? 7 : 5,
      FADE_DELAY = 5000,  

      FADE_DUR = 500,
      MIN_DELAY = 3000,
      WIPE_DELAY = Math.max(url.int('delay', MIN_DELAY), MIN_DELAY),
      TITLE_DELAY = 6000,
      SMALL_WINDOW = 500, // see _shared.scss, fallback for browsers without mq
      TITLE = 'Hot searches on Google right now.',
      wipers = [],
      termsByRegion,
      terms,
      termIndex = 0,
      now,
      lastUpdate,
      idleTimeout, 
      matrixInitialized = false,
      matrix,
      matrixSelect, 
      rows,
      cols,
      pipe,

      showTitle = (function() {

        if (url.tsq == 'tower') {
          
          return function(wiper) {
            return wiper.id == 6 && wiper.numLoops % 2 == 0;
          }

        } else if (url.tsq == 'marquee') {

          return function(wiper) {
            return wiper.id == 5 && wiper.numLoops % 3 == 0;
          }

        } else { 

          return function() {
            return false;
          }

        }

      })(),

      showLogo = (function() {

        if (url.tsq == 'today') {

          return function(wiper) {
            return wiper.numLoops % 2 == 1;
          }

        } else {

          return function() {
            return false;
          }

        }

      })(),

      tsqMarqueeWidths = [320, 520],
      tsqMarqueeLefts = [0, tsqMarqueeWidths[0]],

      tsqTowerHeights = [68, 90, 94, 110, 105, 100, 155],
      tsqTowerTops = (function() {

        var r = [], s = 0, l = tsqTowerHeights.length;
        for (var i = 0; i < l; i++) {
          
          r[i] = s;
          s += tsqTowerHeights[i];

        }

        return r;

      })();

  init();
  getTerms(function(t) {

    termsByRegion = t;

    if (!matrixInitialized) {
      matrixInitialized = true;
      initializeMatrix();
    }

  });

  function getTerms(callback) {

    if (url.terms) {
      callback({ 1: url.terms.split(/ ?, ?/) });
    } else { 
      $.getJSON(url.tsq ? '/api/tsqterms/' : '/api/terms/', callback);
    }

    setTimeout(function() {
      getTerms(callback);
    }, 60 * 60 * 1000);

  }

  function init() {

    // Global resize
    $(window).bind('resize', _.debounce(onResize, 100));

    // No media query fallback
    if (!Modernizr.mq('only all')) {
      var mq = function() {
        $(document.body).toggleClass('small-window', $(window).innerWidth() <= SMALL_WINDOW)
      }
      $(window).bind('resize', mq);
      mq();
    }

    // Idle fade 
    resetIdleTimeout();
    $(document.body).mousemove(function() {
      document.body.classList.remove('idle');
      resetIdleTimeout();
    });

    // Analytics tracking for screensaver
    $('#screensaver-link').click(function() {
        _gaq.push(['_trackEvent', 'Screensaver', 'Download', 'Download']);
    });

    // ----------------------------------------------
    // 
    // Matrix Selector
    // 
    // ----------------------------------------------

    matrixSelect = generateTable(MAX_COLS, MAX_COLS);
    matrixSelect.id = 'matrix-select';

    var matrixSelectShowing = false;
    var $matrixSelectContainer = $('#matrix-select-container');

    $matrixSelectContainer.prepend(matrixSelect);

    $(matrixSelect).find('td').each(function(k, v) {

      var col = Math.floor(k / MAX_COLS);
      var row = k % MAX_COLS;

      // Hover highlight
      $(this).bind('mousemove', function(e) {
        e.preventDefault();
        highlightRows(col, row, 'highlight');
        return false;
      });

      // Set matrix
      $(this).bind('click', function(e) {
        e.preventDefault();
        setMatrix(col, row);

        _gaq.push(['_trackEvent', 'Matrix', 'Change', (col+1) + 'x' + (row+1)]);
        updateURL();

        matrixSelectShowing = false;
        $matrixSelectContainer.removeClass('showing');
        resetIdleTimeout();
        return false;
      });
    });

    var openMatrixSelect = function() {
      highlightRows(0, 0, 'highlight');
      matrixSelectShowing = true;
      $matrixSelectContainer.addClass('showing');
    };

    $('#matrix-button').bind('click', openMatrixSelect)
    if (!Modernizr.touch) {
      $('#matrix-button').bind('mouseenter', openMatrixSelect)
    }

    $matrixSelectContainer.bind('mouseleave', function() {
      matrixSelectShowing = false;
      $matrixSelectContainer.removeClass('showing');
    });

    // ----------------------------------------------
    // 
    // Region Selector
    // 
    // ----------------------------------------------

    var $regionSelect = $('#region-select');
    $('#region').prepend($regionSelect);

    // Alphabetize region select, using locale specific sort.
    var items = $regionSelect.children('option.sort').get();
    items.sort(function(a, b) {

      // find portion of string following first capital letter.
      // (sort den Niederland as Niederland)
      var a = uppercasePortion($(a).text());
      var b = uppercasePortion($(b).text());
      return a.localeCompare(b);

    });

    function isUppercase(c) {
      return c != c.toLowerCase() && c == c.toUpperCase();
    }

    function uppercasePortion(str) {
      var s;
      for (var i = 0, l = str.length; i < l; i++) {
        if (isUppercase(str.charAt(i))) {
          s = i;
          break;
        }
      }
      if (s == undefined) {
        return str;
      }
      return str.substring(s)
    }

    $.each(items, function(k, v) { $regionSelect.append(v); });



    $regionSelect.change(function() {

      setRegion($(this).val());

      _gaq.push(['_trackEvent', 'Region', 'Change', $(this).val()]);
      updateURL();
 
    });

    function resetIdleTimeout() {
      
      if (Modernizr.touch || url.boolean('dev')) return;

      clearTimeout(idleTimeout);
      idleTimeout = setTimeout(fadeIdleable, FADE_DELAY);

    }

  }
  
  function initializeMatrix() {

    matrix = generateMatrix(MAX_COLS, MAX_COLS);
    matrix.id = 'matrix';
    document.getElementById('matrix-container').appendChild(matrix);


    $(matrix)
      .find('.cell').each(function(k) {
        wipers.push(new Wiper(this, k));
      })

    setMatrix(url.int('r', 1)-1, url.int('c', 1)-1);
    setRegion(url.int('p', 0));

    lastUpdate = (+new Date());

    _.each(wipers, startLoop);

    update();

  }

  function startLoop(wiper) {

    wiper.numLoops = 0;

    var delayedNext = function() {
      wiper.timeout = setTimeout(wiper.next, WIPE_DELAY);
    };

    var reallyDelayedNext = function() {
      wiper.timeout = setTimeout(wiper.next, TITLE_DELAY);
    };

    wiper.next = function() {

      clearTimeout(wiper.timeout);

      if (showLogo(wiper)) {

        wiper.showArbitrary('<img src="/orangeroom/logo.png">', reallyDelayedNext)

      } else if (showTitle(wiper)) {
        wiper.typer.forceSpeed = 10;
        wiper.show(TITLE, reallyDelayedNext);
      } else { 
        wiper.typer.forceSpeed = 0;
        wiper.show(terms[++termIndex%terms.length], delayedNext);
      }

      wiper.numLoops++;

    };

    wiper.next();

  }

  function forceNext() {
    _.each(wipers, function(w) {
      if (w.next) w.next(); // meh
    });
  }

  function update() {
    requestAnimationFrame(update);
    now = (+new Date());
    _.each(wipers, updateWiper);
    lastUpdate = now;
  }

  function updateWiper(w) {
    if (!w.disabled) w.update(now - lastUpdate);
  }


  function generateMatrix(rows, cols) {

    var m = document.createElement('div');

    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {

        var cell = document.createElement('div');
        cell.classList.add('cell');
        cell.id = 'cell-' + r + '-' + c;
        m.appendChild(cell);

      }
    }

    return m;

  }


  function setMatrix(r, c) {

    rows = Math.max(Math.min(r, MAX_COLS-1), 0);
    cols = Math.max(Math.min(c, MAX_COLS-1), 0);

    $(matrix).find('.cell').each(function(k, v) {

      var col = Math.floor(k / MAX_COLS);
      var row = k % MAX_COLS;

      if (row > rows || col > cols) {

        wipers[k].disabled = true;
        v.style.display = 'none';

      } else { 

        // Hm.
        if (wipers[k].disabled) wipers[k].onTransitionEnd();

        wipers[k].disabled = false;
        v.style.left = (col) / (cols+1) * 100 + '%';
        

        if (url.tsq == 'tower') {
          v.style.height = tsqTowerHeights[row] + 'px';
          v.style.top = tsqTowerTops[row] + 'px';
          v.style.width = '100%';

        } else if (url.tsq == 'marquee') {

          v.style.height = '100%';
          v.style.top = 0;
          v.style.left = tsqMarqueeLefts[col] + 'px';
          v.style.width = tsqMarqueeWidths[col] + 'px';

        } else { 
          v.style.height = 1 / (rows+1) * 101 + '%';
          v.style.top = (row) / (rows+1) * 100 + '%';
          v.style.width = 1 / (cols+1) * 101 + '%'; // hack for 1px line that shows up

        }


        v.style.display = 'block';
      }

    });
    
    onResize();
    highlightRows(rows, cols, 'select');

  }

  function setRegion(p) {

    var termsRaw;
    pipe = p;
    
    // all regions
    if (p == 0 || !(p in termsByRegion)) {
      termsRaw = _.flatten(termsByRegion);
    } else { 
      termsRaw = termsByRegion[p];
    }

    terms = _.shuffle(_.uniq(termsRaw));

    // Update display

    $selected = $("#region-select option[value='"+p+"']");
    $("#region-select").val(p);
    $("#region span").html($selected.html());

    $("#region-select").width($("#region span").width());

    forceNext();

  }


  function fadeIdleable() {
    document.body.classList.add('idle'); 
  }

  function generateTable(rows, cols) {

    var table = document.createElement('table');

    for (var r = 0; r < rows; r++) {
      var row = document.createElement('tr');
      table.appendChild(row);
      for (var c = 0; c < cols; c++) {

        var cell = document.createElement('td');
        row.appendChild(cell);

      }
    }

    return table;

  }

  function updateURL() {
    
    var args = {};
    if (rows != 0) args.r = rows+1;
    if (cols != 0) args.c = cols+1;
    if (pipe != 0) args.p = pipe;
    if (url.hl) args.hl = url.hl;

    var str = [];
    _.each(args, function(v, k) {
      str.push(k +'=' + v);
    })

    str = str.join('&');

    if (Modernizr.history) {
      history.replaceState({}, '', '?' + str);
    } else { 
      window.location = '?' + str;
    }

    if (parent && parent.postMessage) {
      parent.postMessage('?' + str, "*");
    }

    // if (parent.document.updateUrl) {
    //   parent.document.updateUrl(rows+1, cols+1, pipe)
    // }  

  }

  function onResize() {

    _.each(wipers, function(w) {
      w.onResize();
    });

    var cellWidth = container.innerWidth/(cols+1);
    var cellHeight = container.innerHeight/(rows+1);

    // if (cellWidth > 1280 || cellHeight > 800) {
    //   disableBlur();
    // } else { 
    //   enableBlur();
    // }

  }


  function highlightRows(cols, rows, className) {

    $(matrixSelect).find('td').each(function(k, v) {

      var col = Math.floor(k / MAX_COLS);
      var row = k % MAX_COLS;

      if (col <= cols && row <= rows) {
        $(this).addClass(className);
      } else { 
        $(this).removeClass(className);
      }

    });

  }

})();
