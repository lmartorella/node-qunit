var fs = require('fs'),
    path = require('path'),
    util = require('util'),
    coverage = require('./coverage'),
    child_process = require('child_process'),
    _ = require('underscore'),
    log = exports.log = require('./log');

var options,
    noop = function() {};

options = exports.options = {

    // logging options
    log: {

        // log assertions overview
        assertions: true,

        // log expected and actual values for failed tests
        errors: true,

        // log tests overview
        tests: true,

        // log summary
        summary: true,

        // log global summary (all files)
        globalSummary: true,

        // log coverage
        coverage: true,

        // log global coverage (all files)
        globalCoverage: true,

        // log currently testing code file
        testing: true
    },

    // run test coverage tool
    coverage: false,

    // define file dependencies, which are required then before code
    deps: null,

    // define module dependencies, which are required then before code
    moduleDeps: null,

    // define namespace your code will be attached to on global['your namespace']
    namespace: null
};

/**
 * Run one spawned instance with tests
 * @param {Object} opts
 * @param {Function} callback
 */
function runOne(opts, callback) {
    var child;
    
    // Assign a new port to original debug port    
    for (var i = 0; i < process.execArgv.length; i++) {
        process.execArgv[i] = process.execArgv[i].replace(/--debug-brk=(\d+)/, function(match, m1) {
            var port = new Number(m1);
            port++;
            return '--debug-brk=' + port.toString();
        });
    }

    child = child_process.fork(
        __dirname + '/child.js',
        [JSON.stringify(opts)],
        {env: process.env}
    );

    function kill() {
        process.removeListener('exit', kill);
        child.kill();
    }

    child.on('message', function(msg) {
        if (msg.event === 'assertionDone') {
            log.add('assertions', msg.data);
        } else if (msg.event === 'testDone') {
            log.add('tests', msg.data);
        } else if (msg.event === 'done') {
			if (!!opts.code) {
				msg.data.code = opts.code.path;
			} else{
				msg.data.code = '<none>';
			}
            log.add('summaries', msg.data);
            if (opts.coverage) {
                coverage.add(msg.data.coverage);
                msg.data.coverage = coverage.get();
                msg.data.coverage.code = msg.data.code;
                log.add('coverages', msg.data.coverage);
            }
            if (opts.log.testing) {
                console.log('done');
            }
            callback(null, msg.data);
            kill();
        } else if (msg.event === 'uncaughtException') {
            callback(_.extend(new Error(), msg.data));
            kill();
        }
    });

    process.on('exit', kill);

    if (opts.log.testing && !!opts.code) {
        util.print('\nTesting ', opts.code.path + ' ... ');
    }
}

/**
 * Make an absolute path from relative
 * @param {string|Object} file
 * @return {Object}
 */
function absPath(file) {
	if (!file) {
		return undefined;
	}

    if (typeof file === 'string') {
        file = {path: file};
    }

    if (file.path.charAt(0) != '/') {
        file.path = path.resolve(process.cwd(), file.path);
    }

    return file;
}

/**
 * Convert path or array of paths to array of abs paths
 * @param {Array|string} files
 * @return {Array}
 */
function absPaths(files) {
    var ret = [];

    if (Array.isArray(files)) {
        files.forEach(function(file) {
            ret.push(absPath(file));
        });
    } else if (files) {
        ret.push(absPath(files));
    }

    return ret;
}

/**
 * Run tests in spawned node instance async for every test.
 * @param {Object|Array} files
 * @param {Function} callback optional
 */
exports.run = function(files, callback) {
    var filesCount = 0;

    callback || (callback = noop);

    if (!Array.isArray(files)) {
        files = [files];
    }

    if (options.coverage || files[0].coverage) coverage.setup(options.coverage);

    files.forEach(function(file) {
        var opts =  _.extend({}, options, file);

        !opts.log && (opts.log = {});
        opts.deps = absPaths(opts.deps);
        opts.code = absPath(opts.code);
        opts.tests = absPaths(opts.tests);

		if (!!opts.moduleDeps) {
			if (!Array.isArray(opts.moduleDeps)) {
				opts.deps.push(opts.moduleDeps);
			} else {
				opts.moduleDeps.forEach(function(mod) {
					opts.deps.push(mod);
				});
			}
		}

        runOne(opts, function(err, stat) {
            if (err) {
                return callback(err, log.stats());
            }

            filesCount++;

            if (filesCount >= files.length) {
                _.each(opts.log, function(val, name) {
                    if (val && log.print[name]) {
                        log.print[name]();
                    }
                });

                // Write coverage report.
                if (opts.coverage) coverage.report();
                callback(null, log.stats());
            }
        });
    });
};


/**
 * Set options
 * @param {Object}
 */
exports.setup = function(opts) {
    _.extend(options, opts);
};
