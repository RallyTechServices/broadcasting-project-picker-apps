Ext.define("TSMultiProjectVelocity", {
    extend: 'Rally.app.App',
    componentCls: 'app',
    logger: new Rally.technicalservices.Logger(),
    defaults: { margin: 10 },

    config: {
        defaultSettings: {
            showScopeSelector: true,
            showControls: true
        }
    },

    integrationHeaders : {
        name : "TSMultiProjectVelocity"
    },
                        
    launch: function() {
        var me = this;
        this._addComponents();
    },
    
    _addComponents: function() {
        this.removeAll();

        this.headerContainer = this.add({
            xtype:'container',
            itemId:'header-ct', 
            layout: {type: 'hbox'}
        });
        
        this.displayContainer = this.add({
            xtype:'container',
            itemId:'body-ct'
        });
        
        this.headerContainer.add({
            xtype: 'rallynumberfield',
            fieldLabel: 'Number of Sprints',
            labelWidth: 100,
            width: 150,
            margin: '3 10 0 0',
            value : 5,
            minValue: 1,
            allowBlank: false,
            listeners: {
                change: function(picker) {
                    this.sprint_count = picker.getValue()
                    this._updateData();
                },
                scope: this
            }
        });

        if ( this.getSetting('showScopeSelector') || this.getSetting('showScopeSelector') == "true" ) {
            this.headerContainer.add({
                xtype: 'tsmultiprojectpicker',
                listeners: {
                    change: function(picker, projects) {
                        this._changeProjects(picker,projects);
                        this._publishProjects();
                    },
                    scope: this
                }
            });
            this.subscribe(this, 'requestProjects', this._publishProjects, this);
        } else {
            this.subscribe(this, 'projectsChanged', this._changeProjects, this);
            this.publish('requestProjects', this);
        }
        //this._changeProjects();
        
    },
    
    _changeProjects: function(picker,projects) {
        this.logger.log("Chosen projects:", projects);
        this.projects = projects;
        this._updateData();
    },
    
    _updateData: function() {
        this.displayContainer.removeAll();
        var me = this,
            projects = this.projects,
            sprint_count = this.sprint_count || 5;
        
        if ( Ext.isEmpty(projects) || projects.length === 0 ) { return; }

        this.logger.log("Updating data for sprints/projects", sprint_count, projects);
        
        this.setLoading("Loading data...");
        
        Deft.Chain.pipeline([
            function() { return this._getRecentIterations(sprint_count); },
            function(iterations) {
                iterations.reverse();
                me.iterations = iterations;
                return this._getProjectIterations();
            },
            function(information_by_project) {
                return this._getIterationVelocities(information_by_project);
            }
        ],this).then({
            success: function(results) {
                this._makeChart(results);
            },
            failure: function(msg){
                Ext.Msg.alert("Problem loading iteration information");
            },
            scope: this
        }).always(function(){ me.setLoading(false) });
    },
    
    _getRecentIterations: function(sprint_count) {
        var config = {
            limit: sprint_count,
            pageSize: sprint_count,
            model: 'Iteration',
            context: {
                projectScopeDown: false,
                projectScopeUp: false
            },
            filters: [{property:'EndDate', operator: '<', value: Rally.util.DateTime.toIsoString(new Date)}],
            fetch: ['Name','EndDate'],
            sorters: [{property:'EndDate',direction:'DESC'}]
        }
        
        return this._loadWsapiRecords(config);
    },
    
    _getProjectIterations: function() {
        var deferred = Ext.create("Deft.Deferred");
        
        var base_iterations = this.iterations;
        var projects = this.projects;
        
        var filters = this._getProjectFilter().and(this._getIterationFilter());
        var config = {
            model:'Iteration',
            filters: filters,
            context: { project: null },
            fetch: ['Project','Name','ObjectID','EndDate'],
            sorters: [{property:'EndDate', direction:'ASC'}]
        }
        
        this._loadWsapiRecords(config).then({
            success: function(iterations) {
                var information_by_project = {}; // key is project ObjectID
                
                Ext.Array.each(iterations, function(iteration) {
                    var project_oid = iteration.get('Project').ObjectID;
                    var name = iteration.get('Name');
                    
                    if ( Ext.isEmpty(information_by_project[project_oid]) ) {
                        information_by_project[project_oid] = this._getDataObject(base_iterations);
                    }
                    
                    information_by_project[project_oid][name] = iteration;
                },this);
                
                this.logger.log('info:', information_by_project);
                
                deferred.resolve(information_by_project);
            },
            failure: function(msg) {
                deferred.reject(msg);
            },
            scope: this
        });
        
        return deferred.promise;
    },
    
    _getDataObject: function(iterations) {
        var obj = {};
        
        Ext.Array.each(iterations, function(iteration){
            obj[iteration.get('Name')] = null;
        });
        
        return obj;
    },
    
    // given a set of iterations (divided by project oid) update to add
    // velocities
    
    _getIterationVelocities: function(information_by_project) {
        var me = this,
            deferred = Ext.create('Deft.Deferred');
            
        var base_iterations = this.iterations;

        var promises = [];
        
        Ext.Object.each(information_by_project, function(oid,data_obj) {
            Ext.Array.each(base_iterations, function(base_iteration){
                var name = base_iteration.get('Name');
                var iteration = data_obj[name];
                
                if ( !Ext.isEmpty(iteration) ) {
                    promises.push( function() {
                        return me._setVelocityOnIteration(iteration);
                    });
                }
            },this);
        });
        
        Deft.Chain.sequence(promises).then({
            success: function(results) {
                console.log('--',information_by_project);
                deferred.resolve(information_by_project);
            },
            failure: function(msg) {
                deferred.reject(msg);
            },
            scope: this
        });
        
        
        return deferred.promise;
    },
    
    _setVelocityOnIteration: function(iteration) {
        var deferred = Ext.create('Deft.Deferred');
        this.logger.log('_setVelocityOnIteration:',iteration);
        var config = {
            model: 'IterationCumulativeFlowData',
            filters: [
                {property:'IterationObjectID', value: iteration.get('ObjectID')},
                {property:'CardState', value: 'Accepted' }
            ],
            fetch: ['CardEstimateTotal','CardState','CreationDate']
        };
        
        this._loadWsapiRecords(config).then({
            success: function(results) {
                iteration.set('__velocity', null);
                
                if ( results.length > 0 ) {
                    var last_card = _.last(results);
                    var velocity = last_card.get('CardEstimateTotal');
                    iteration.set('__velocity', velocity);
                }
                
                deferred.resolve();
            },
            failure: function(msg) {
                deferred.reject(msg);
            },
            scope: this
        });
        
        return deferred;
    },
    
    _makeChart: function(information_by_project) {
        var base_iterations = this.iterations;
        var projects = this.projects;
        
        this.displayContainer.add({
            xtype: 'rallychart',
            loadMask: false,
            chartData: this._getChartData(information_by_project),
            chartConfig: this._getChartConfig()
        });
    },
    
    _getChartData: function(information_by_project) {
        var base_iterations = this.iterations;
        var projects = this.projects;
        
        var categories = Ext.Array.map(base_iterations, function(iteration){ return iteration.get('Name');});
        
        var series = Ext.Array.map(projects, function(project){
            var project_oid = project.ObjectID;
            
            var data = Ext.Array.map(base_iterations, function(iteration){
                var name = iteration.get('Name');
                var project_iteration = information_by_project[project_oid] && information_by_project[project_oid][name];
                
                if ( Ext.isEmpty(project_iteration) ) { return null; }
                return project_iteration.get('__velocity');
            });
            
            return {
                name: project.Name,
                data: data
            }
        });
        
        return { 
            series: series,
            categories: categories
        }
        
    },
    
    _getChartConfig: function() {
        return {
            chart: {
                type: 'line'
            },
            title: {
                text: 'Velocity'
            },
            xAxis: {
            },
            yAxis: {
                min: 0,
                    title: {
                    text: 'Points'
                }
            }
        };
    },
    
    _getIterationFilter: function() {
         this.logger.log('_getIterationFilter', this.iterations)

        if (!this.iterations || this.iterations.length === 0){
            return { property:'ObjectID', operator: '>', value: 0 };
        }
        
        var filters =  Ext.Array.map(this.iterations, function(iteration) {
            return  { property:'Name', value: iteration.get('Name') };
        });

        return Rally.data.wsapi.Filter.or(filters);
    },
    
    _getProjectFilter: function(){
        this.logger.log('_getProjectFilter', this.projects)

        if (!this.projects || this.projects.length === 0){
            return { property:'Project.ObjectID', operator: '>', value: 0 };
        }
        
        var filters =  Ext.Array.map(this.projects, function(project) {
            return { property:'Project.ObjectID', value: project.ObjectID };
        });

        return Rally.data.wsapi.Filter.or(filters);
    },
    
    _publishProjects: function() {
        this.publish('projectsChanged', this.down('tsmultiprojectpicker'), this.projects || []);  
    },
      
    _loadWsapiRecords: function(config){
        var deferred = Ext.create('Deft.Deferred');
        var me = this;
        var default_config = {
            model: 'Defect',
            fetch: ['ObjectID']
        };
        this.logger.log("Starting load:",config.model);
        Ext.create('Rally.data.wsapi.Store', Ext.Object.merge(default_config,config)).load({
            callback : function(records, operation, successful) {
                if (successful){
                    deferred.resolve(records);
                } else {
                    me.logger.log("Failed: ", operation);
                    deferred.reject('Problem loading: ' + operation.error.errors.join('. '));
                }
            }
        });
        return deferred.promise;
    },
    
    getOptions: function() {
        return [
            {
                text: 'About...',
                handler: this._launchInfo,
                scope: this
            }
        ];
    },
    
    _launchInfo: function() {
        if ( this.about_dialog ) { this.about_dialog.destroy(); }
        this.about_dialog = Ext.create('Rally.technicalservices.InfoLink',{});
    },
    
    getSettingsFields: function() {
        var type_filters = Rally.data.wsapi.Filter.or([
            {property: 'TypePath', value: 'HierarchicalRequirement'},
            {property: 'TypePath', operator: 'contains', value: 'PortfolioItem/'}
        ]);
        
        return [{
            name: 'showScopeSelector',
            xtype: 'rallycheckboxfield',
            fieldLabel: 'Show Scope Selector'
        }];
    },
    
    isExternal: function(){
        return typeof(this.getAppId()) == 'undefined';
    }
    
});
